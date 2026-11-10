-- get_user_ratings_reviews sorted only by updated_at or by rating. A player
-- has many games at one score, and ratings written together share
-- updated_at, so OFFSET pages could repeat or skip a tied row. Each sort now
-- ends with updated_at (newest first), the game name, and the game id. A
-- player has one row per game, so the order is total. The body is otherwise
-- the 0001 body.
--
-- The 0001 function is SECURITY DEFINER with no fixed search_path. This pins
-- it to public, pg_temp, as 0006 does for the functions it replaced. CREATE OR
-- REPLACE with the same signature and return type keeps the owner and grants.
CREATE OR REPLACE FUNCTION public.get_user_ratings_reviews(p_user_id uuid, p_filter text DEFAULT 'all'::text, p_sort text DEFAULT 'date'::text, p_order text DEFAULT 'desc'::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(rating integer, review text, created_at timestamp with time zone, updated_at timestamp with time zone, game_id uuid, game_name text, game_slug text, game_cover_image_url text, game_released date, game_developer text, total_count bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO public, pg_temp
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
    CASE WHEN p_sort = 'rating' AND p_order = 'asc' THEN rr.rating END ASC NULLS LAST,
    CASE WHEN p_sort = 'rating' THEN rr.updated_at END DESC,
    g.name,
    g.id
  LIMIT p_limit
  OFFSET p_offset;
$function$;
