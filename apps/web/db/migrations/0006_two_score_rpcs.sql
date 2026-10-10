-- Two-score contract. Drops and recreates the score RPCs so their return
-- types no longer include Metacritic. Does not drop games.metacritic_score:
-- app/sitemap.ts still orders by that column until Task 7, and Task 8 drops
-- the column. Historical migrations 0001 and 0002 are unchanged.
--
-- Dependants are inventoried first. An unexpected dependent aborts the
-- migration. DROP is the exact signature, never CASCADE. Grants, owner, and
-- configuration are restored in this same script.

CREATE TEMP TABLE score_rpc_acl (
    proname text PRIMARY KEY,
    identity_args text NOT NULL,
    owner_name text NOT NULL,
    proconfig text[],
    acl aclitem[]
);

INSERT INTO score_rpc_acl (proname, identity_args, owner_name, proconfig, acl)
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid),
       pg_get_userbyid(p.proowner),
       p.proconfig,
       p.proacl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'get_feed',
      'get_follow_recommendations',
      'get_loadout_rating_highlights',
      'get_trending_games',
      'query_games'
  );

DO $$
DECLARE
    v_count integer;
    v_dependent text;
BEGIN
    SELECT count(*) INTO v_count FROM score_rpc_acl;
    IF v_count <> 5 THEN
        RAISE EXCEPTION 'Refusing score RPC rewrite: expected 5 functions, found %', v_count;
    END IF;

    SELECT string_agg(format('%s depends via %s', pg_describe_object(d.classid, d.objid, d.objsubid), d.deptype), '; ')
      INTO v_dependent
    FROM pg_depend d
    JOIN pg_proc p ON p.oid = d.refobjid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
          'get_feed',
          'get_follow_recommendations',
          'get_loadout_rating_highlights',
          'get_trending_games',
          'query_games'
      )
      AND d.deptype = 'n';
    IF v_dependent IS NOT NULL THEN
        RAISE EXCEPTION 'Refusing score RPC rewrite; unexpected dependants: %', v_dependent;
    END IF;
END $$;

DROP FUNCTION public.get_feed(uuid, integer, integer);
DROP FUNCTION public.get_follow_recommendations(uuid, integer);
DROP FUNCTION public.get_loadout_rating_highlights(uuid);
DROP FUNCTION public.get_trending_games(integer, integer, uuid);
DROP FUNCTION public.query_games(text, text, text, text, text, text, text, text, integer, integer, uuid, uuid[]);

-- get_feed is the 0002 body: SECURITY DEFINER, so library-add rows still
-- require users.library_public. The Metacritic output column is gone.
CREATE FUNCTION public.get_feed(p_user_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(activity_type text, created_at timestamp with time zone, actor_id uuid, actor_username text, actor_avatar_url text, game_id uuid, game_name text, game_slug text, game_cover_image_url text, game_released date, game_developer text, game_avg_rating numeric, viewer_game_rating integer, list_id uuid, list_name text, list_description text, list_owner_username text, list_game_count bigint, list_last_activity timestamp with time zone, list_like_count bigint, viewer_liked_list boolean, list_cover_urls text[], rating integer, review text, review_created_at timestamp with time zone, review_updated_at timestamp with time zone, library_status text, library_game_count bigint, library_cover_urls text[], library_game_names text[])
 LANGUAGE sql
 SECURITY DEFINER
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
    u.id, u.username, u.avatar_url,
    g.id, g.name, g.slug, g.cover_image_url, g.released,
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

  ORDER BY created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$function$;

-- Eligibility is unchanged: a followed user's completed game they rated at
-- least 7. Because this body changed, it now repeats library_entries' privacy
-- gate (library_public). The averages stay recommendation-only; they are not
-- a score shown on the game page. Lists read here are the viewer's own.
CREATE FUNCTION public.get_follow_recommendations(p_user_id uuid, p_limit integer DEFAULT 10)
 RETURNS TABLE(game_id uuid, game_name text, game_slug text, game_cover_image_url text, game_released date, game_developer text, avg_follower_rating numeric, follower_count bigint, platform_avg_rating numeric, user_library_status text)
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
  JOIN users followed_account ON followed_account.id = le.user_id
    AND COALESCE(followed_account.library_public, false)
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
  ORDER BY follower_count DESC, avg_follower_rating DESC, g.id
  LIMIT p_limit;
$function$;

CREATE FUNCTION public.get_loadout_rating_highlights(p_user_id uuid)
 RETURNS TABLE(game_id uuid, game_name text, game_slug text, cover_image_url text, rating integer, highlight_type text, released text)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  WITH user_ratings AS (
    SELECT rr.game_id, rr.rating, g.name, g.slug, g.cover_image_url, g.released
    FROM ratings_reviews rr
    JOIN games g ON g.id = rr.game_id
    WHERE rr.user_id = p_user_id
  ),
  max_rating AS (SELECT MAX(rating) FROM user_ratings),
  min_rating AS (SELECT MIN(rating) FROM user_ratings)

  SELECT game_id, name, slug, cover_image_url, rating, 'top' as highlight_type, released::text
  FROM user_ratings
  WHERE rating = (SELECT * FROM max_rating)

  UNION ALL

  SELECT game_id, name, slug, cover_image_url, rating, 'bottom' as highlight_type, released::text
  FROM user_ratings
  WHERE rating = (SELECT * FROM min_rating)
  AND (SELECT * FROM max_rating) != (SELECT * FROM min_rating);
$function$;

-- Public trending. Library adds count only when that library is public,
-- matching library_entries' own gate. Ratings stay public. Ranking is still
-- recent activity, then the game id for a stable tie.
CREATE FUNCTION public.get_trending_games(p_days integer DEFAULT 7, p_limit integer DEFAULT 10, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(game_id uuid, game_name text, game_slug text, game_cover_image_url text, game_released date, game_developer text, activity_count bigint, avg_rating numeric, user_rating integer)
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
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = le.user_id AND COALESCE(u.library_public, false)
    )
  LEFT JOIN ratings_reviews rr ON rr.game_id = g.id
    AND rr.created_at > NOW() - (p_days || ' days')::interval
  LEFT JOIN ratings_reviews rr2 ON rr2.game_id = g.id
    AND rr2.user_id = p_user_id
  WHERE le.game_id IS NOT NULL OR rr.game_id IS NOT NULL
  GROUP BY g.id
  ORDER BY activity_count DESC, g.id
  LIMIT p_limit;
$function$;

-- Default is name ascending. Community sort is average, rating count, name,
-- id, nulls last. Name and your-rating end in the same total order. An
-- unknown sort, including the removed metacritic_score key, matches none of
-- the CASE branches and falls through to name, then id.
CREATE FUNCTION public.query_games(p_q text DEFAULT NULL::text, p_genre text DEFAULT NULL::text, p_platform text DEFAULT NULL::text, p_developer text DEFAULT NULL::text, p_publisher text DEFAULT NULL::text, p_esrb text DEFAULT NULL::text, p_sort text DEFAULT 'name'::text, p_order text DEFAULT 'asc'::text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_user_id uuid DEFAULT NULL::uuid, p_game_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(id uuid, name text, slug text, cover_image_url text, released date, avg_ngplus_rating numeric, user_rating integer, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_genre_id uuid;
  v_platform_id uuid;
  v_developer_id uuid;
  v_publisher_id uuid;
BEGIN
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
      ROUND(AVG(rating)::numeric, 2) as avg_rating,
      COUNT(*)::bigint as rating_count
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
    g.released,
    gr.avg_rating as avg_ngplus_rating,
    vr.rating as user_rating,
    COUNT(*) OVER() as total_count
  FROM games g
  JOIN filtered_games fg ON fg.id = g.id
  LEFT JOIN game_ratings gr ON gr.game_id = g.id
  LEFT JOIN viewer_ratings vr ON vr.game_id = g.id
  ORDER BY
    CASE WHEN p_sort = 'ngplus_rating' AND p_order = 'desc'
      THEN gr.avg_rating END DESC NULLS LAST,
    CASE WHEN p_sort = 'ngplus_rating' AND p_order = 'asc'
      THEN gr.avg_rating END ASC NULLS LAST,
    CASE WHEN p_sort = 'ngplus_rating' AND p_order = 'desc'
      THEN gr.rating_count END DESC NULLS LAST,
    CASE WHEN p_sort = 'ngplus_rating' AND p_order = 'asc'
      THEN gr.rating_count END ASC NULLS LAST,
    CASE WHEN p_sort = 'your_rating' AND p_order = 'desc'
      THEN vr.rating END DESC NULLS LAST,
    CASE WHEN p_sort = 'your_rating' AND p_order = 'asc'
      THEN vr.rating END ASC NULLS LAST,
    CASE WHEN p_sort = 'name' AND p_order = 'desc'
      THEN g.name END DESC,
    g.name ASC,
    g.id ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

DO $$
DECLARE
    r record;
    g record;
    cfg text;
BEGIN
    FOR r IN SELECT * FROM score_rpc_acl LOOP
        EXECUTE format('ALTER FUNCTION public.%I(%s) OWNER TO %I', r.proname, r.identity_args, r.owner_name);
        IF r.proconfig IS NOT NULL THEN
            FOREACH cfg IN ARRAY r.proconfig LOOP
                EXECUTE format('ALTER FUNCTION public.%I(%s) SET %s', r.proname, r.identity_args, replace(cfg, '=', ' = '));
            END LOOP;
        END IF;
        IF r.acl IS NOT NULL THEN
            EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', r.proname, r.identity_args);
            FOR g IN SELECT * FROM aclexplode(r.acl) LOOP
                EXECUTE format(
                    'GRANT %s ON FUNCTION public.%I(%s) TO %s%s',
                    g.privilege_type,
                    r.proname,
                    r.identity_args,
                    CASE WHEN g.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(g.grantee::regrole::text) END,
                    CASE WHEN g.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END
                );
            END LOOP;
        END IF;
        IF NOT (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = r.proname) THEN
            RAISE EXCEPTION 'Score RPC % lost SECURITY DEFINER', r.proname;
        END IF;
    END LOOP;
END $$;

DROP TABLE score_rpc_acl;
