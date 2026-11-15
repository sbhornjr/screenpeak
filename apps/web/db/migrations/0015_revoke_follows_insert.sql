-- `follows` predates the Drizzle-bypasses-RLS rearchitecture and still carried
-- its original Supabase RLS policies, including an INSERT policy
-- ("Users can follow others", WITH CHECK auth.uid() = follower_id) that let
-- any signed-in user re-create a follow row directly through PostgREST
-- (POST /rest/v1/follows) — completely bypassing followUser()'s block check
-- in lib/queries/user.ts, which only exists in application code and was never
-- enforced by Postgres. That let a blocked user defeat the block.
--
-- Confirmed nothing uses PostgREST for `follows`: the only supabase-js
-- `.from(` call in the app is `.from('users')` in lib/queries/user-auth.ts.
-- Every follows read/write goes through `db` (Drizzle), which bypasses RLS
-- entirely via the pooler role's BYPASSRLS. So, unlike the brief's minimal
-- option of dropping just the INSERT policy, all three existing policies are
-- dropped here and the matching grants revoked, mirroring how push_tokens,
-- steam_link_intents, api_rate_limits, and this plan's own blocks/reports are
-- locked down (0009, 0010, 0013, 0014): ENABLE ROW LEVEL SECURITY with zero
-- policies, no grants to anon/authenticated/PUBLIC.
DROP POLICY IF EXISTS "Anyone can see follows" ON follows;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can follow others" ON follows;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can unfollow" ON follows;
--> statement-breakpoint
REVOKE ALL ON follows FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        REVOKE ALL ON TABLE public.follows FROM service_role;
    END IF;
END $$;
