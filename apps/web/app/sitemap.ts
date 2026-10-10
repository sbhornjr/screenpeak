import type { MetadataRoute } from 'next'
import { loadSitemap } from '@/lib/queries/sitemap'

// A sitemap is a hint for crawlers, not an access list — anything reachable by
// following links can be indexed whether or not it's listed here. Private lists
// stay out. A database failure rejects this function so Next does not publish
// a successful sitemap that simply omitted the games.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
    return loadSitemap(base)
}
