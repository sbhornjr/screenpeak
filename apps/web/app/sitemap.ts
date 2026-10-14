import type { MetadataRoute } from 'next'
import { countSitemapEntries, loadSitemapShard, sitemapIdCount } from '@/lib/queries/sitemap'

// A sitemap is a hint for crawlers, not an access list — anything reachable by
// following links can be indexed whether or not it's listed here. Private lists
// stay out. A database failure rejects this function so Next does not publish
// a successful sitemap that simply omitted the games. Steam imports can grow
// past one protocol document, so each id is its own file of at most 50,000 URLs.
export async function generateSitemaps() {
    const counts = await countSitemapEntries()
    return Array.from({ length: sitemapIdCount(counts) }, (_, id) => ({ id }))
}

export default async function sitemap(props: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
    const raw = await props.id
    const id = Number(raw)
    if (!Number.isInteger(id) || id < 0 || String(id) !== raw) throw new Error('sitemap id must be a non-negative integer')
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
    return loadSitemapShard(base, id)
}
