import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
    return {
        // robots.txt is advisory (keeps well-behaved crawlers out of search
        // results) — it is not access control. /auth/ pages are still guarded
        // by their own session checks.
        rules: { userAgent: '*', allow: '/', disallow: ['/settings', '/steamlink', '/auth/', '/api/'] },
        sitemap: `${base}/sitemap.xml`,
    }
}
