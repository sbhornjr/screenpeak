import { withSentryConfig } from '@sentry/nextjs/config'
import type { NextConfig } from 'next'

const r2PublicUrl = process.env.R2_PUBLIC_URL
if (!r2PublicUrl) throw new Error('R2_PUBLIC_URL is not set')

const nextConfig: NextConfig = {
    // packages/shared ships TypeScript source, not built JS — Next has to compile it.
    transpilePackages: ['@screenpeak/shared'],
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'images.igdb.com',
                port: '',
                pathname: '/igdb/image/upload/**',
                search: '',
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
        }, {
            // No file extension, so Next can't infer a MIME type from the static
            // file alone — iOS Universal Links expect this served as JSON.
            source: '/.well-known/apple-app-site-association',
            headers: [{ key: 'Content-Type', value: 'application/json' }],
        }]
    },
}

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "im-a-teapot",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
})
