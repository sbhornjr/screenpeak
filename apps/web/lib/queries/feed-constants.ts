// Split out of lib/queries/feed.ts: FeedList.tsx ('use client') only needs this
// constant, not getFeed() — but importing anything from feed.ts pulls in that
// module's top-level `import { db } from '@/lib/db'`, which bundles the
// Node-only `postgres` driver into the browser. Keeping the constant in its own
// dependency-free file avoids that.
export const FEED_PAGE_SIZE = 12
