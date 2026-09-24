import type { NextConfig } from 'next'

const r2PublicUrl = process.env.R2_PUBLIC_URL
if (!r2PublicUrl) throw new Error('R2_PUBLIC_URL is not set')

const nextConfig: NextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'media.rawg.io',
            },
            {
                protocol: 'https',
                // Derived from R2_PUBLIC_URL rather than hardcoded, so the two
                // can't drift if the bucket's custom domain ever changes.
                hostname: new URL(r2PublicUrl).hostname,
            },
        ],
    },
    async headers() {
        return [{
            source: '/:path*',
            headers: [
                { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
                { key: 'X-Frame-Options', value: 'DENY' },
                { key: 'X-Content-Type-Options', value: 'nosniff' },
                { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
                { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
            ],
        }]
    },
}

export default nextConfig