-- Functions and triggers captured from live ScreenPeak (project ygklffurlraowplszqhr) via pg_proc / pg_trigger introspection
-- Generated 2026-09-21T17:30:17.824Z

-- ============ FUNCTIONS ============

CREATE OR REPLACE FUNCTION public.get_avg_ratings_for_games(p_game_ids uuid[])
 RETURNS TABLE(game_id uuid, avg_rating numeric)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT game_id, ROUND(AVG(rating)::numeric, 2)
  FROM ratings_reviews
  WHERE game_id = ANY(p_game_ids)
  GROUP BY game_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_feed(p_user_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(activity_type text, created_at timestamp with time zone, actor_id uuid, actor_username text, actor_avatar_url text, game_id uuid, game_name text, game_slug text, game_cover_image_url text, game_released date, game_metacritic_score integer, game_developer text, game_avg_rating numeric, viewer_game_rating integer, list_id uuid, list_name text, list_description text, list_owner_username text, list_game_count bigint, list_last_activity timestamp with time zone, list_like_count bigint, viewer_liked_list boolean, list_cover_urls text[], rating integer, review text, review_created_at timestamp with time zone, review_updated_at timestamp with time zone, library_status text, library_game_count bigint, library_cover_urls text[], library_game_names text[])
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  WITH followed_users AS (
    SELECT following_id FROM follows WHERE follower_id = p_user_id
  ),

  -- Every game that can surface in this feed: library adds + ratings/reviews
  -- by followed users. Bounds the two aggregates below. MATERIALIZED because
  -- it is referenced twice.
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

  -- ---- Library adds: merge bursts ---------------------------------------
  -- Flag the first row of each burst for a user: first add ever, or an add
  -- after a >45 min idle gap. (created_at, game_id) ordering keeps this
  -- deterministic when a bulk import writes many identical timestamps.
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
    WHERE le.user_id IN (SELECT following_id FROM followed_users)
    WINDOW w AS (PARTITION BY le.user_id ORDER BY le.created_at, le.game_id)
  ),
  -- Running sum of the flag = a stable burst id within each user.
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
  -- Collapse each burst to one row; newest-first samples feed the card.
  -- sample_status is only meaningful when game_count = 1.
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

  -- Library adds — single-game bursts keep the full game card
  SELECT
    'library_add' AS activity_type,
    lib.created_at,
    u.id, u.username, u.avatar_url,
    g.id, g.name, g.slug, g.cover_image_url, g.released, g.metacritic_score,
    gd.name AS game_developer,
    gar.avg_rating AS game_avg_rating,
    vr.rating AS viewer_game_rating,
    NULL::uuid, NULL::text, NULL::text, NULL::text,
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

  -- Library adds — multi-game bursts collapse to one batch row
  SELECT
    'library_add_batch' AS activity_type,
    lib.created_at,
    u.id, u.username, u.avatar_url,
    NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::date, NULL::int4,
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

  -- Ratings and reviews
  SELECT
    CASE WHEN rr.review IS NOT NULL AND rr.review != ''
      THEN 'review' ELSE 'rating' END,
    rr.created_at,
    u.id, u.username, u.avatar_url,
    g.id, g.name, g.slug, g.cover_image_url, g.released, g.metacritic_score,
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

  -- Lists created
  SELECT
    'list_created',
    l.created_at,
    u.id, u.username, u.avatar_url,
    NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::date, NULL::int4,
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

  -- Lists liked
  SELECT
    'list_liked',
    ll.created_at,
    u.id, u.username, u.avatar_url,
    NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::date, NULL::int4,
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

  ORDER BY created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$function$;

CREATE OR REPLACE FUNCTION public.get_follow_recommendations(p_user_id uuid, p_limit integer DEFAULT 10)
 RETURNS TABLE(game_id uuid, game_name text, game_slug text, game_cover_image_url text, game_released date, game_developer text, metacritic_score integer, avg_follower_rating numeric, follower_count bigint, platform_avg_rating numeric, user_library_status text)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT
    g.id,
    g.name,
    g.slug,
    g.cover_image_url,
    g.released,
    (
      SELECT d.name FROM game_developers gd
      JOIN developers d ON d.id = gd.developer_id
      WHERE gd.game_id = g.id LIMIT 1
    ) as game_developer,
    g.metacritic_score,
    ROUND(AVG(rr.rating)::numeric, 2) as avg_follower_rating,
    COUNT(DISTINCT le.user_id) as follower_count,
    (
      SELECT ROUND(AVG(rating)::numeric, 2)
      FROM ratings_reviews
      WHERE game_id = g.id
    ) as platform_avg_rating,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM library_entries
        WHERE game_id = g.id AND user_id = p_user_id AND status = 'backlog'
      ) THEN 'backlog'
      WHEN EXISTS (
        SELECT 1 FROM list_games lg
        JOIN lists l ON l.id = lg.list_id
        WHERE lg.game_id = g.id
          AND l.user_id = p_user_id
          AND l.is_default = true
      ) THEN 'wishlist'
      ELSE 'none'
    END as user_library_status
  FROM follows f
  JOIN library_entries le ON le.user_id = f.following_id
    AND le.status = 'completed'
  JOIN ratings_reviews rr ON rr.game_id = le.game_id
    AND rr.user_id = f.following_id
    AND rr.rating >= 7
  JOIN games g ON g.id = le.game_id
  WHERE f.follower_id = p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM library_entries
      WHERE game_id = g.id
        AND user_id = p_user_id
        AND status NOT IN ('backlog')
    )
  GROUP BY g.id
  ORDER BY follower_count DESC, avg_follower_rating DESC
  LIMIT p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.get_game_avg_rating(p_game_id uuid)
 RETURNS numeric
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT ROUND(AVG(rating)::numeric, 2)
  FROM ratings_reviews
  WHERE game_id = p_game_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_game_ratings_stats(p_game_id uuid)
 RETURNS TABLE(total_ratings bigint, total_reviews bigint, rating_1 bigint, rating_2 bigint, rating_3 bigint, rating_4 bigint, rating_5 bigint, rating_6 bigint, rating_7 bigint, rating_8 bigint, rating_9 bigint, rating_10 bigint, avg_rating numeric)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT
    COUNT(*) as total_ratings,
    COUNT(*) FILTER (WHERE review IS NOT NULL AND review != '') as total_reviews,
    COUNT(*) FILTER (WHERE rating = 1) as rating_1,
    COUNT(*) FILTER (WHERE rating = 2) as rating_2,
    COUNT(*) FILTER (WHERE rating = 3) as rating_3,
    COUNT(*) FILTER (WHERE rating = 4) as rating_4,
    COUNT(*) FILTER (WHERE rating = 5) as rating_5,
    COUNT(*) FILTER (WHERE rating = 6) as rating_6,
    COUNT(*) FILTER (WHERE rating = 7) as rating_7,
    COUNT(*) FILTER (WHERE rating = 8) as rating_8,
    COUNT(*) FILTER (WHERE rating = 9) as rating_9,
    COUNT(*) FILTER (WHERE rating = 10) as rating_10,
    ROUND(AVG(rating)::numeric, 2) as avg_rating
  FROM ratings_reviews
  WHERE game_id = p_game_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_library_developers(p_user_id uuid)
 RETURNS TABLE(id uuid, name text, slug text)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT DISTINCT d.id, d.name, d.slug
  FROM developers d
  JOIN game_developers gd ON d.id = gd.developer_id
  JOIN library_entries le ON gd.game_id = le.game_id
  WHERE le.user_id = p_user_id
  ORDER BY d.name;
$function$;

CREATE OR REPLACE FUNCTION public.get_library_esrb_ratings(p_user_id uuid)
 RETURNS TABLE(esrb_rating text)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT DISTINCT g.esrb_rating
  FROM games g
  JOIN library_entries le ON g.id = le.game_id
  WHERE le.user_id = p_user_id
  AND g.esrb_rating IS NOT NULL
  ORDER BY g.esrb_rating;
$function$;

CREATE OR REPLACE FUNCTION public.get_library_genres(p_user_id uuid)
 RETURNS TABLE(id uuid, name text, slug text)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT DISTINCT g.id, g.name, g.slug
  FROM genres g
  JOIN game_genres gg ON g.id = gg.genre_id
  JOIN library_entries le ON gg.game_id = le.game_id
  WHERE le.user_id = p_user_id
  ORDER BY g.name;
$function$;

CREATE OR REPLACE FUNCTION public.get_library_platforms(p_user_id uuid)
 RETURNS TABLE(id uuid, name text, slug text)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT DISTINCT p.id, p.name, p.slug
  FROM platforms p
  JOIN game_platforms gp ON p.id = gp.platform_id
  JOIN library_entries le ON gp.game_id = le.game_id
  WHERE le.user_id = p_user_id
  ORDER BY p.name;
$function$;

CREATE OR REPLACE FUNCTION public.get_library_publishers(p_user_id uuid)
 RETURNS TABLE(id uuid, name text, slug text)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT DISTINCT p.id, p.name, p.slug
  FROM publishers p
  JOIN game_publishers gp ON p.id = gp.publisher_id
  JOIN library_entries le ON gp.game_id = le.game_id
  WHERE le.user_id = p_user_id
  ORDER BY p.name;
$function$;

CREATE OR REPLACE FUNCTION public.get_liked_lists(p_user_id uuid)
 RETURNS TABLE(id uuid, name text, description text, is_public boolean, is_default boolean, is_pinned boolean, created_at timestamp with time zone, last_activity timestamp with time zone, game_count bigint, owner_username text, owner_avatar_url text, owner_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT
    l.id,
    l.name,
    l.description,
    l.is_public,
    l.is_default,
    l.is_pinned,
    l.created_at,
    COALESCE(MAX(lg.added_at), l.created_at) as last_activity,
    COUNT(lg.game_id) as game_count,
    u.username as owner_username,
    u.avatar_url as owner_avatar_url,
    u.id as owner_id
  FROM list_likes ll
  JOIN lists l ON l.id = ll.list_id
  JOIN users u ON u.id = l.user_id
  LEFT JOIN list_games lg ON lg.list_id = l.id
  WHERE ll.user_id = p_user_id
  AND l.is_public = true
  GROUP BY l.id, u.username, u.avatar_url, u.id, ll.created_at
  ORDER BY ll.created_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_loadout_developer_stats(p_user_id uuid)
 RETURNS TABLE(developer_name text, avg_rating numeric, weighted_rating numeric, game_count bigint, rated_count bigint)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  WITH user_avg AS (
    SELECT AVG(rating)::numeric as overall_avg
    FROM ratings_reviews
    WHERE user_id = p_user_id
  ),
  dev_raw AS (
    SELECT
      d.name as developer_name,
      ROUND(AVG(rr.rating)::numeric, 2) as avg_rating,
      COUNT(DISTINCT le.game_id) as game_count,
      COUNT(rr.rating) as rated_count
    FROM developers d
    JOIN game_developers gd ON d.id = gd.developer_id
    JOIN library_entries le ON gd.game_id = le.game_id AND le.user_id = p_user_id
    LEFT JOIN ratings_reviews rr ON gd.game_id = rr.game_id AND rr.user_id = p_user_id
    GROUP BY d.name
    HAVING COUNT(rr.rating) >= 1
  )
  SELECT
    dr.developer_name,
    dr.avg_rating,
    ROUND(
      (dr.rated_count::numeric / (dr.rated_count + 3)) * dr.avg_rating +
      (3.0 / (dr.rated_count + 3)) * ua.overall_avg,
    2) as weighted_rating,
    dr.game_count,
    dr.rated_count
  FROM dev_raw dr, user_avg ua
  ORDER BY weighted_rating DESC NULLS LAST;
$function$;

CREATE OR REPLACE FUNCTION public.get_loadout_genre_stats(p_user_id uuid)
 RETURNS TABLE(genre_id uuid, genre_name text, avg_rating numeric, weighted_rating numeric, rated_count bigint, completed_count bigint, total_count bigint)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  WITH user_avg AS (
    SELECT AVG(rating)::numeric as overall_avg
    FROM ratings_reviews
    WHERE user_id = p_user_id
  ),
  genre_raw AS (
    SELECT 
      g.id as genre_id,
      g.name as genre_name,
      ROUND(AVG(rr.rating)::numeric, 2) as avg_rating,
      COUNT(rr.rating) as rated_count,
      COUNT(CASE WHEN le.status = 'completed' THEN 1 END) as completed_count,
      COUNT(le.game_id) as total_count
    FROM genres g
    JOIN game_genres gg ON g.id = gg.genre_id
    JOIN library_entries le ON gg.game_id = le.game_id AND le.user_id = p_user_id
    LEFT JOIN ratings_reviews rr ON gg.game_id = rr.game_id AND rr.user_id = p_user_id
    GROUP BY g.id, g.name
  )
  SELECT 
    gr.genre_id,
    gr.genre_name,
    gr.avg_rating,
    ROUND(
      (gr.rated_count::numeric / (gr.rated_count + 3)) * gr.avg_rating +
      (3.0 / (gr.rated_count + 3)) * ua.overall_avg,
    2) as weighted_rating,
    gr.rated_count,
    gr.completed_count,
    gr.total_count
  FROM genre_raw gr, user_avg ua
  ORDER BY weighted_rating DESC NULLS LAST;
$function$;

CREATE OR REPLACE FUNCTION public.get_loadout_platform_stats(p_user_id uuid)
 RETURNS TABLE(platform_name text, count bigint)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT p.name as platform_name, COUNT(le.game_id) as count
  FROM platforms p
  JOIN game_platforms gp ON p.id = gp.platform_id
  JOIN library_entries le ON gp.game_id = le.game_id AND le.user_id = p_user_id
  GROUP BY p.name
  ORDER BY count DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_loadout_rating_highlights(p_user_id uuid)
 RETURNS TABLE(game_id uuid, game_name text, game_slug text, cover_image_url text, rating integer, highlight_type text, released text, metacritic_score integer)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  WITH user_ratings AS (
    SELECT rr.game_id, rr.rating, g.name, g.slug, g.cover_image_url, g.released, g.metacritic_score
    FROM ratings_reviews rr
    JOIN games g ON g.id = rr.game_id
    WHERE rr.user_id = p_user_id
  ),
  max_rating AS (SELECT MAX(rating) FROM user_ratings),
  min_rating AS (SELECT MIN(rating) FROM user_ratings)
  
  SELECT game_id, name, slug, cover_image_url, rating, 'top' as highlight_type, released, metacritic_score
  FROM user_ratings
  WHERE rating = (SELECT * FROM max_rating)
  
  UNION ALL
  
  SELECT game_id, name, slug, cover_image_url, rating, 'bottom' as highlight_type, released, metacritic_score
  FROM user_ratings
  WHERE rating = (SELECT * FROM min_rating)
  AND (SELECT * FROM max_rating) != (SELECT * FROM min_rating);
$function$;

CREATE OR REPLACE FUNCTION public.get_loadout_status_breakdown(p_user_id uuid)
 RETURNS TABLE(status text, count bigint)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT status, COUNT(*) as count
  FROM library_entries
  WHERE user_id = p_user_id
  GROUP BY status;
$function$;

CREATE OR REPLACE FUNCTION public.get_recommended_lists(p_user_id uuid, p_limit integer DEFAULT 5)
 RETURNS TABLE(list_id uuid, list_name text, list_description text, owner_username text, follower_like_count bigint, total_like_count bigint, user_has_liked boolean, last_activity timestamp with time zone, game_count bigint, cover_urls text[])
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT
    l.id,
    l.name,
    l.description,
    u.username as owner_username,
    COUNT(DISTINCT ll.user_id) as follower_like_count,
    (SELECT COUNT(*) FROM list_likes WHERE list_id = l.id) as total_like_count,
    EXISTS(
      SELECT 1 FROM list_likes
      WHERE list_id = l.id AND user_id = p_user_id
    ) as user_has_liked,
    COALESCE(
      (SELECT MAX(lg2.added_at) FROM list_games lg2 WHERE lg2.list_id = l.id),
      l.created_at
    ) as last_activity,
    (SELECT COUNT(*) FROM list_games lg3 WHERE lg3.list_id = l.id) as game_count,
    ARRAY(
      SELECT g.cover_image_url
      FROM list_games lg
      JOIN games g ON g.id = lg.game_id
      WHERE lg.list_id = l.id AND g.cover_image_url IS NOT NULL
      ORDER BY lg.position LIMIT 3
    ) as cover_urls
  FROM list_likes ll
  JOIN follows f ON f.following_id = ll.user_id
    AND f.follower_id = p_user_id
  JOIN lists l ON l.id = ll.list_id
    AND l.is_public = true
  JOIN users u ON u.id = l.user_id
  WHERE l.user_id != p_user_id
    AND NOT EXISTS(
      SELECT 1 FROM list_likes
      WHERE list_id = l.id AND user_id = p_user_id
    )
  GROUP BY l.id, u.username, l.created_at
  ORDER BY follower_like_count DESC
  LIMIT p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.get_trending_games(p_days integer DEFAULT 7, p_limit integer DEFAULT 10, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(game_id uuid, game_name text, game_slug text, game_cover_image_url text, metacritic_score integer, game_released date, game_developer text, activity_count bigint, avg_rating numeric, user_rating integer)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT 
    g.id,
    g.name,
    g.slug,
    g.cover_image_url,
    g.metacritic_score,
    g.released,
    (
      SELECT d.name 
      FROM game_developers gd 
      JOIN developers d ON d.id = gd.developer_id 
      WHERE gd.game_id = g.id 
      LIMIT 1
    ) as game_developer,
    COUNT(DISTINCT COALESCE(le.user_id::text, rr.user_id::text)) as activity_count,
    ROUND(AVG(DISTINCT rr.rating)::numeric, 2) as avg_rating,
    MAX(CASE WHEN rr2.user_id = p_user_id THEN rr2.rating END) as user_rating
  FROM games g
  LEFT JOIN library_entries le ON le.game_id = g.id 
    AND le.created_at > NOW() - (p_days || ' days')::interval
  LEFT JOIN ratings_reviews rr ON rr.game_id = g.id
    AND rr.created_at > NOW() - (p_days || ' days')::interval
  LEFT JOIN ratings_reviews rr2 ON rr2.game_id = g.id
    AND rr2.user_id = p_user_id
  WHERE le.game_id IS NOT NULL OR rr.game_id IS NOT NULL
  GROUP BY g.id
  ORDER BY activity_count DESC
  LIMIT p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.get_trending_lists(p_days integer DEFAULT 7, p_limit integer DEFAULT 10, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(list_id uuid, list_name text, list_description text, owner_username text, last_activity timestamp with time zone, game_count bigint, like_count bigint, recent_like_count bigint, user_has_liked boolean, cover_urls text[])
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT
    l.id as list_id,
    l.name as list_name,
    l.description as list_description,
    u.username as owner_username,
    COALESCE(MAX(lg.added_at), l.created_at) as last_activity,
    COUNT(DISTINCT lg.game_id) as game_count,
    COUNT(DISTINCT ll.user_id) as like_count,
    COUNT(DISTINCT CASE 
      WHEN ll.created_at > NOW() - (p_days || ' days')::interval 
      THEN ll.user_id 
    END) as recent_like_count,
    BOOL_OR(ll.user_id = p_user_id) as user_has_liked,
    ARRAY(
      SELECT g.cover_image_url
      FROM list_games lg2
      JOIN games g ON g.id = lg2.game_id
      WHERE lg2.list_id = l.id
        AND g.cover_image_url IS NOT NULL
      ORDER BY lg2.position
      LIMIT 5
    ) as cover_urls
  FROM lists l
  JOIN users u ON u.id = l.user_id
  LEFT JOIN list_games lg ON lg.list_id = l.id
  LEFT JOIN list_likes ll ON ll.list_id = l.id
  WHERE l.is_public = true
    AND l.is_default = false
  GROUP BY l.id, u.username
  HAVING COUNT(DISTINCT CASE 
    WHEN ll.created_at > NOW() - (p_days || ' days')::interval 
    THEN ll.user_id 
  END) > 0
  ORDER BY recent_like_count DESC, like_count DESC
  LIMIT p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_lists(p_user_id uuid, p_include_private boolean DEFAULT false)
 RETURNS TABLE(id uuid, name text, description text, is_public boolean, is_default boolean, is_pinned boolean, created_at timestamp with time zone, last_activity timestamp with time zone, game_count bigint, owner_username text, owner_avatar_url text, owner_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT
    l.id,
    l.name,
    l.description,
    l.is_public,
    l.is_default,
    l.is_pinned,
    l.created_at,
    COALESCE(MAX(lg.added_at), l.created_at) as last_activity,
    COUNT(lg.game_id) as game_count,
    u.username as owner_username,
    u.avatar_url as owner_avatar_url,
    u.id as owner_id
  FROM lists l
  JOIN users u ON u.id = l.user_id
  LEFT JOIN list_games lg ON lg.list_id = l.id
  WHERE l.user_id = p_user_id
  AND (p_include_private = true OR l.is_public = true)
  GROUP BY l.id, u.username, u.avatar_url, u.id
  ORDER BY l.is_default DESC, l.is_pinned DESC, last_activity DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_ratings_reviews(p_user_id uuid, p_filter text DEFAULT 'all'::text, p_sort text DEFAULT 'date'::text, p_order text DEFAULT 'desc'::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(rating integer, review text, created_at timestamp with time zone, updated_at timestamp with time zone, game_id uuid, game_name text, game_slug text, game_cover_image_url text, game_released date, game_developer text, total_count bigint)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT
    rr.rating,
    rr.review,
    rr.created_at,
    rr.updated_at,
    g.id as game_id,
    g.name as game_name,
    g.slug as game_slug,
    g.cover_image_url as game_cover_image_url,
    g.released as game_released,
    (
      SELECT d.name FROM game_developers gd
      JOIN developers d ON d.id = gd.developer_id
      WHERE gd.game_id = g.id LIMIT 1
    ) as game_developer,
    COUNT(*) OVER() as total_count
  FROM ratings_reviews rr
  JOIN games g ON g.id = rr.game_id
  WHERE rr.user_id = p_user_id
  AND (
    p_filter = 'all'
    OR (p_filter = 'reviews' AND rr.review IS NOT NULL AND rr.review != '')
    OR (p_filter = 'ratings' AND (rr.review IS NULL OR rr.review = ''))
  )
  ORDER BY
    CASE WHEN p_sort = 'date' AND p_order = 'desc' THEN rr.updated_at END DESC,
    CASE WHEN p_sort = 'date' AND p_order = 'asc' THEN rr.updated_at END ASC,
    CASE WHEN p_sort = 'rating' AND p_order = 'desc' THEN rr.rating END DESC NULLS LAST,
    CASE WHEN p_sort = 'rating' AND p_order = 'asc' THEN rr.rating END ASC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_ratings_reviews_counts(p_user_id uuid)
 RETURNS TABLE(total_count bigint, review_count bigint, rating_count bigint)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE review IS NOT NULL AND review != '') as review_count,
    COUNT(*) FILTER (WHERE review IS NULL OR review = '') as rating_count
  FROM ratings_reviews
  WHERE user_id = p_user_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_who_to_follow(p_user_id uuid, p_limit integer DEFAULT 5)
 RETURNS TABLE(user_id uuid, username text, display_name text, avatar_url text, selected_title text, created_at timestamp with time zone, mutual_follower_count bigint, follower_count bigint, following_count bigint, game_count bigint, avg_rating numeric)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT
    u.id,
    u.username,
    u.display_name,
    u.avatar_url,
    u.selected_title,
    u.created_at,
    COUNT(DISTINCT f1.follower_id) as mutual_follower_count,
    (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as follower_count,
    (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following_count,
    COUNT(DISTINCT le.game_id) as game_count,
    ROUND(AVG(rr.rating)::numeric, 1) as avg_rating
  FROM follows f1
  -- f1: people p_user_id follows (e.g. hornflakes2 → hornflakes)
  JOIN follows f2 ON f2.follower_id = f1.following_id
  -- f2: who those people follow (e.g. hornflakes → hornflakes3)
  JOIN users u ON u.id = f2.following_id
  -- u: the candidate to recommend (hornflakes3)
  LEFT JOIN library_entries le ON le.user_id = u.id
  LEFT JOIN ratings_reviews rr ON rr.user_id = u.id
  WHERE f1.follower_id = p_user_id
    -- don't recommend yourself
    AND f2.following_id != p_user_id
    -- don't recommend people already followed
    AND NOT EXISTS (
      SELECT 1 FROM follows
      WHERE follower_id = p_user_id AND following_id = f2.following_id
    )
  GROUP BY u.id
  ORDER BY mutual_follower_count DESC
  LIMIT p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.users (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  );
  
  INSERT INTO public.lists (user_id, name, is_public, is_default, is_pinned)
  VALUES (NEW.id, 'Wishlist', true, true, true);
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.query_games(p_q text DEFAULT NULL::text, p_genre text DEFAULT NULL::text, p_platform text DEFAULT NULL::text, p_developer text DEFAULT NULL::text, p_publisher text DEFAULT NULL::text, p_esrb text DEFAULT NULL::text, p_sort text DEFAULT 'metacritic_score'::text, p_order text DEFAULT 'desc'::text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_user_id uuid DEFAULT NULL::uuid, p_game_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(id uuid, name text, slug text, cover_image_url text, metacritic_score integer, released date, avg_ngplus_rating numeric, user_rating integer, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_genre_id uuid;
  v_platform_id uuid;
  v_developer_id uuid;
  v_publisher_id uuid;
BEGIN
  -- Resolve slugs to IDs
  IF p_genre IS NOT NULL THEN
    SELECT genres.id INTO v_genre_id FROM genres WHERE genres.slug = p_genre;
  END IF;
  IF p_platform IS NOT NULL THEN
    SELECT platforms.id INTO v_platform_id FROM platforms WHERE platforms.slug = p_platform;
  END IF;
  IF p_developer IS NOT NULL THEN
    SELECT developers.id INTO v_developer_id FROM developers WHERE developers.slug = p_developer;
  END IF;
  IF p_publisher IS NOT NULL THEN
    SELECT publishers.id INTO v_publisher_id FROM publishers WHERE publishers.slug = p_publisher;
  END IF;

  RETURN QUERY
  WITH filtered_games AS (
    SELECT DISTINCT g.id
    FROM games g
    WHERE (p_q IS NULL OR g.name ILIKE '%' || p_q || '%')
    AND (p_esrb IS NULL OR g.esrb_rating = p_esrb)
    AND (p_game_ids IS NULL OR g.id = ANY(p_game_ids))
    AND (v_genre_id IS NULL OR EXISTS (
      SELECT 1 FROM game_genres WHERE game_id = g.id AND genre_id = v_genre_id
    ))
    AND (v_platform_id IS NULL OR EXISTS (
      SELECT 1 FROM game_platforms WHERE game_id = g.id AND platform_id = v_platform_id
    ))
    AND (v_developer_id IS NULL OR EXISTS (
      SELECT 1 FROM game_developers WHERE game_id = g.id AND developer_id = v_developer_id
    ))
    AND (v_publisher_id IS NULL OR EXISTS (
      SELECT 1 FROM game_publishers WHERE game_id = g.id AND publisher_id = v_publisher_id
    ))
  ),
  game_ratings AS (
    SELECT game_id,
      ROUND(AVG(rating)::numeric, 2) as avg_rating
    FROM ratings_reviews
    WHERE game_id IN (SELECT filtered_games.id FROM filtered_games)
    GROUP BY game_id
  ),
  viewer_ratings AS (
    SELECT game_id, rating
    FROM ratings_reviews
    WHERE user_id = p_user_id
    AND game_id IN (SELECT filtered_games.id FROM filtered_games)
  )
  SELECT
    g.id,
    g.name,
    g.slug,
    g.cover_image_url,
    g.metacritic_score,
    g.released,
    gr.avg_rating as avg_ngplus_rating,
    vr.rating as user_rating,
    COUNT(*) OVER() as total_count
  FROM games g
  JOIN filtered_games fg ON fg.id = g.id
  LEFT JOIN game_ratings gr ON gr.game_id = g.id
  LEFT JOIN viewer_ratings vr ON vr.game_id = g.id
  ORDER BY
    CASE WHEN p_sort = 'metacritic_score' AND p_order = 'desc' 
      THEN g.metacritic_score END DESC NULLS LAST,
    CASE WHEN p_sort = 'metacritic_score' AND p_order = 'asc' 
      THEN g.metacritic_score END ASC NULLS LAST,
    CASE WHEN p_sort = 'name' AND p_order = 'asc' 
      THEN g.name END ASC,
    CASE WHEN p_sort = 'name' AND p_order = 'desc' 
      THEN g.name END DESC,
    CASE WHEN p_sort = 'ngplus_rating' AND p_order = 'desc' 
      THEN gr.avg_rating END DESC NULLS LAST,
    CASE WHEN p_sort = 'ngplus_rating' AND p_order = 'asc' 
      THEN gr.avg_rating END ASC NULLS LAST,
    CASE WHEN p_sort = 'your_rating' AND p_order = 'desc' 
      THEN vr.rating END DESC NULLS LAST,
    CASE WHEN p_sort = 'your_rating' AND p_order = 'asc' 
      THEN vr.rating END ASC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- Note: public.rls_auto_enable() and its event trigger (ensure_rls) are Supabase
-- platform defaults present on every project, not app-specific — intentionally
-- excluded here so this migration doesn't overwrite the platform's own copy.

-- ============ TRIGGERS ============

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER update_library_entries_updated_at BEFORE UPDATE ON public.library_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_ratings_reviews_updated_at BEFORE UPDATE ON public.ratings_reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at();

