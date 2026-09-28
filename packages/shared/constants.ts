// Plain constants both apps need. Dependency-free on purpose: client code (the
// web's 'use client' FeedList, the phone app) imports these, so this file must
// never pull in db/postgres — the reason FEED_PAGE_SIZE was split out of
// apps/web/lib/queries/feed.ts in the first place.

/** Feed items per page — the web's infinite scroll and the /api/v1 feed use the same size. */
export const FEED_PAGE_SIZE = 12
