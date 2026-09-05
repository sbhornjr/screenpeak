import type { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabase-server'

// A sitemap is a hint for crawlers, not an access list — anything reachable by
// following links (nav, game cards, "reviewed by X" links, …) can be indexed
// whether or not it's listed here. This just helps discovery/recrawl priority
// for pages that are unconditionally public.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
    const supabase = await createClient()

    const [{ data: games }, { data: users }, { data: lists }] = await Promise.all([
        supabase
            .from('games')
            .select('slug, updated_at')
            // Order before capping — otherwise which 5000 games you get is
            // whatever order Postgres feels like returning, and can shift
            // between requests. Well-known games first, unscored games last.
            .order('metacritic_score', { ascending: false, nullsFirst: false })
            .limit(5000),
        // No private profiles exist, so every user page is a clean include.
        supabase.from('users').select('id, username'),
        // Lists ARE sometimes private — filter on that.
        supabase.from('lists').select('id, user_id, updated_at').eq('is_public', true),
    ])

    const usernameById = new Map((users ?? []).map((u) => [u.id, u.username]))

    return [
        { url: base, lastModified: new Date() },
        { url: `${base}/games`, lastModified: new Date() },
        { url: `${base}/explore`, lastModified: new Date() },
        ...(games ?? []).map((g) => ({
            url: `${base}/games/${g.slug}`,
            lastModified: g.updated_at ? new Date(g.updated_at) : undefined,
        })),
        ...(users ?? []).map((u) => ({
            url: `${base}/user/${u.username}`,
        })),
        ...(lists ?? [])
            .map((l) => {
                const username = usernameById.get(l.user_id)
                if (!username) return null
                return {
                    url: `${base}/user/${username}/lists/${l.id}`,
                    lastModified: l.updated_at ? new Date(l.updated_at) : undefined,
                }
            })
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    ]
}
