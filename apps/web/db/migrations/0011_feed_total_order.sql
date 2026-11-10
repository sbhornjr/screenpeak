-- get_feed sorted only by created_at. Rows written in one transaction share
-- now(), so OFFSET pages could repeat or skip a tied row. The sort now ends
-- with actor, activity type, game, and list: one row per combination, so the
-- order is total. The body is otherwise the 0006 body.
--
-- CREATE OR REPLACE with the same signature and return type keeps the owner,
-- grants, SECURITY DEFINER, and the search_path setting restated here.
CREATE OR REPLACE FUNCTION public.get_feed(p_user_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(activity_type text, created_at timestamp with time zone, actor_id uuid, actor_username text, actor_avatar_url text, game_id uuid, game_name text, game_slug text, game_cover_image_url text, game_released date, game_developer text, game_avg_rating numeric, viewer_game_rating integer, list_id uuid, list_name text, list_description text, list_owner_username text, list_game_count bigint, list_last_activity timestamp with time zone, list_like_count bigint, viewer_liked_list boolean, list_cover_urls text[], rating integer, review text, review_created_at timestamp with time zone, review_updated_at timestamp with time zone, library_status text, library_game_count bigint, library_cover_urls text[], library_game_names text[])
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO public, pg_temp
AS $function$
  WITH followed_users AS (
    SELECT following_id FROM follows WHERE follower_id = p_user_id
  ),

  relevant_games AS MATERIALIZED (
    SELECT le.game_id
    FROM library_entries le
    WHERE le.user_id IN (SELECT following_id FROM followed_users)
    UNION
    SELECT rr.game_id
    FROM ratings_reviews rr
    WHERE rr.user_id IN (SELECT following_id FROM followed_users)
  ),

  game_avg_ratings AS (
    SELECT game_id, ROUND(AVG(rating)::numeric, 2) AS avg_rating
    FROM ratings_reviews
    WHERE game_id IN (SELECT game_id FROM relevant_games)
    GROUP BY game_id
  ),

  viewer_ratings AS (
    SELECT game_id, rating
    FROM ratings_reviews
    WHERE user_id = p_user_id
  ),

  game_developers AS (
    SELECT DISTINCT ON (gd.game_id) gd.game_id, d.name
    FROM game_developers gd
    JOIN developers d ON d.id = gd.developer_id
    WHERE gd.game_id IN (SELECT game_id FROM relevant_games)
  ),

  list_stats AS (
    SELECT
      l.id AS list_id,
      COUNT(DISTINCT lg.game_id) AS game_count,
      COALESCE(MAX(lg.added_at), l.created_at) AS last_activity,
      COUNT(DISTINCT ll.user_id) AS like_count,
      BOOL_OR(ll.user_id = p_user_id) AS viewer_liked
    FROM lists l
    LEFT JOIN list_games lg ON lg.list_id = l.id
    LEFT JOIN list_likes ll ON ll.list_id = l.id
    GROUP BY l.id
  ),

  library_add_events AS (
    SELECT
      le.user_id,
      le.game_id,
      le.created_at,
      le.status,
      CASE
        WHEN LAG(le.created_at) OVER w IS NULL
          OR le.created_at - LAG(le.created_at) OVER w > interval '45 minutes'
        THEN 1 ELSE 0
      END AS is_new_burst
    FROM library_entries le
    JOIN users owner ON owner.id = le.user_id AND COALESCE(owner.library_public, false)
    WHERE le.user_id IN (SELECT following_id FROM followed_users)
    WINDOW w AS (PARTITION BY le.user_id ORDER BY le.created_at, le.game_id)
  ),
  library_bursts AS (
    SELECT
      lae.*,
      SUM(is_new_burst) OVER (
        PARTITION BY user_id
        ORDER BY created_at, game_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS burst_id
    FROM library_add_events lae
  ),
  library_add_grouped AS (
    SELECT
      b.user_id,
      b.burst_id,
      MAX(b.created_at) AS created_at,
      COUNT(*) AS game_count,
      (array_agg(b.game_id ORDER BY b.created_at DESC, b.game_id DESC))[1] AS sample_game_id,
      (array_agg(b.status  ORDER BY b.created_at DESC, b.game_id DESC))[1] AS sample_status,
      (array_agg(g.cover_image_url ORDER BY b.created_at DESC, b.game_id DESC)
        FILTER (WHERE g.cover_image_url IS NOT NULL))[1:5] AS cover_urls,
      (array_agg(g.name ORDER BY b.created_at DESC, b.game_id DESC))[1:5] AS game_names
    FROM library_bursts b
    JOIN games g ON g.id = b.game_id
    GROUP BY b.user_id, b.burst_id
  )

  SELECT
    'library_add' AS activity_type,
    lib.created_at,
    -- The first branch names the union's columns; the ORDER BY below uses these.
    u.id AS actor_id, u.username, u.avatar_url,
    g.id AS game_id, g.name, g.slug, g.cover_image_url, g.released,
    gd.name AS game_developer,
    gar.avg_rating AS game_avg_rating,
    vr.rating AS viewer_game_rating,
    NULL::uuid AS list_id, NULL::text, NULL::text, NULL::text,
    NULL::bigint, NULL::timestamptz, NULL::bigint, NULL::boolean, NULL::text[],
    NULL::int4, NULL::text, NULL::timestamptz, NULL::timestamptz,
    lib.sample_status,
    NULL::bigint, NULL::text[], NULL::text[]
  FROM library_add_grouped lib
  JOIN users u ON u.id = lib.user_id
  JOIN games g ON g.id = lib.sample_game_id
  LEFT JOIN game_avg_ratings gar ON gar.game_id = g.id
  LEFT JOIN viewer_ratings vr ON vr.game_id = g.id
  LEFT JOIN game_developers gd ON gd.game_id = g.id
  WHERE lib.game_count = 1

  UNION ALL

  SELECT
    'library_add_batch' AS activity_type,
    lib.created_at,
    u.id, u.username, u.avatar_url,
    NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::date,
    NULL::text, NULL::numeric, NULL::int4,
    NULL::uuid, NULL::text, NULL::text, NULL::text,
    NULL::bigint, NULL::timestamptz, NULL::bigint, NULL::boolean, NULL::text[],
    NULL::int4, NULL::text, NULL::timestamptz, NULL::timestamptz,
    NULL::text,
    lib.game_count,
    lib.cover_urls,
    lib.game_names
  FROM library_add_grouped lib
  JOIN users u ON u.id = lib.user_id
  WHERE lib.game_count > 1

  UNION ALL

  SELECT
    CASE WHEN rr.review IS NOT NULL AND rr.review != ''
      THEN 'review' ELSE 'rating' END,
    rr.created_at,
    u.id, u.username, u.avatar_url,
    g.id, g.name, g.slug, g.cover_image_url, g.released,
    gd.name,
    gar.avg_rating,
    vr.rating AS viewer_game_rating,
    NULL::uuid, NULL::text, NULL::text, NULL::text,
    NULL::bigint, NULL::timestamptz, NULL::bigint, NULL::boolean, NULL::text[],
    rr.rating, rr.review, rr.created_at, rr.updated_at,
    NULL::text,
    NULL::bigint, NULL::text[], NULL::text[]
  FROM ratings_reviews rr
  JOIN users u ON u.id = rr.user_id
  JOIN games g ON g.id = rr.game_id
  LEFT JOIN game_avg_ratings gar ON gar.game_id = g.id
  LEFT JOIN viewer_ratings vr ON vr.game_id = g.id
  LEFT JOIN game_developers gd ON gd.game_id = g.id
  WHERE rr.user_id IN (SELECT following_id FROM followed_users)

  UNION ALL

  SELECT
    'list_created',
    l.created_at,
    u.id, u.username, u.avatar_url,
    NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::date,
    NULL::text, NULL::numeric, NULL::int4,
    l.id, l.name, l.description, u.username,
    ls.game_count, ls.last_activity, ls.like_count, ls.viewer_liked,
    ARRAY(
      SELECT g.cover_image_url
      FROM list_games lg2
      JOIN games g ON g.id = lg2.game_id
      WHERE lg2.list_id = l.id
      ORDER BY lg2.position
      LIMIT 5
    ) AS list_cover_urls,
    NULL::int4, NULL::text, NULL::timestamptz, NULL::timestamptz,
    NULL::text,
    NULL::bigint, NULL::text[], NULL::text[]
  FROM lists l
  JOIN users u ON u.id = l.user_id
  JOIN list_stats ls ON ls.list_id = l.id
  WHERE l.user_id IN (SELECT following_id FROM followed_users)
  AND l.is_public = true
  AND l.is_default = false

  UNION ALL

  SELECT
    'list_liked',
    ll.created_at,
    u.id, u.username, u.avatar_url,
    NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::date,
    NULL::text, NULL::numeric, NULL::int4,
    l.id, l.name, l.description, owner.username,
    ls.game_count, ls.last_activity, ls.like_count, ls.viewer_liked,
    ARRAY(
      SELECT g.cover_image_url
      FROM list_games lg2
      JOIN games g ON g.id = lg2.game_id
      WHERE lg2.list_id = l.id
      ORDER BY lg2.position
      LIMIT 5
    ) AS list_cover_urls,
    NULL::int4, NULL::text, NULL::timestamptz, NULL::timestamptz,
    NULL::text,
    NULL::bigint, NULL::text[], NULL::text[]
  FROM list_likes ll
  JOIN users u ON u.id = ll.user_id
  JOIN lists l ON l.id = ll.list_id
  JOIN users owner ON owner.id = l.user_id
  JOIN list_stats ls ON ls.list_id = l.id
  WHERE ll.user_id IN (SELECT following_id FROM followed_users)
  AND l.is_public = true

  ORDER BY created_at DESC, actor_id, activity_type, game_id, list_id
  LIMIT p_limit
  OFFSET p_offset;
$function$;
