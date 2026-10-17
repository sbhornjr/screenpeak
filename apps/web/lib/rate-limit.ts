import 'server-only'
import { sql } from 'drizzle-orm'
import { ApiError } from '@/lib/api'
import { db } from '@/lib/db'

// Fixed window in Postgres (migration 0009). One statement, so a Vercel
// transaction-pooler connection can run it. Hits stop growing once the
// bucket is already over the limit.

export const WRITE_RATE_LIMIT = 60
export const WRITE_RATE_WINDOW_SECONDS = 60
export const SEARCH_RATE_LIMIT = 120
export const SEARCH_RATE_WINDOW_SECONDS = 60

const BUCKET = /^[a-z0-9:._-]{1,180}$/

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/
const IPV6 = /^[0-9a-f:]+$/

export function clientAddress(headerList: { get(name: string): string | null }): string {
    const real = headerList.get('x-real-ip')?.trim()
    const forwarded = headerList.get('x-forwarded-for')
    const last = forwarded?.split(',').map(part => part.trim()).filter(Boolean).at(-1)
    const token = (real || last || '').split(/[\s;]+/)[0]?.trim().toLowerCase() ?? ''
    if (IPV4.test(token)) return token
    if (token.includes(':') && IPV6.test(token)) return token.slice(0, 64)
    return 'local'
}

/** Signed-in search shares one bucket. Signed-out search keys off the client address. */
export function searchBucket(userId: string | null, headerList: { get(name: string): string | null }): string {
    if (userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
        return `search:user:${userId.toLowerCase()}`
    }
    return `search:ip:${clientAddress(headerList)}`
}

export async function consumeApiRateLimit(bucket: string, limit: number, windowSeconds: number): Promise<void> {
    const key = bucket.toLowerCase()
    if (!BUCKET.test(key)) throw new Error('Invalid rate limit bucket.')
    const rows = await db.execute(sql`
        insert into api_rate_limits (bucket, window_start, hits)
        values (${key}, clock_timestamp(), 1)
        on conflict (bucket) do update set
            hits = case
                when api_rate_limits.window_start + (${windowSeconds} * interval '1 second') <= clock_timestamp()
                    then 1
                when api_rate_limits.hits > ${limit}
                    then api_rate_limits.hits
                else api_rate_limits.hits + 1
            end,
            window_start = case
                when api_rate_limits.window_start + (${windowSeconds} * interval '1 second') <= clock_timestamp()
                    then clock_timestamp()
                else api_rate_limits.window_start
            end
        returning
            hits,
            greatest(1, ceil(extract(epoch from (
                window_start + (${windowSeconds} * interval '1 second') - clock_timestamp()
            ))))::int as retry_after
    `) as unknown as { hits: number | string, retry_after: number | string }[]

    const row = rows[0]
    if (!row) throw new Error('Rate limit write returned no row.')
    const hits = typeof row.hits === 'number' ? row.hits : Number(row.hits)
    if (hits <= limit) return
    const retry = typeof row.retry_after === 'number' ? row.retry_after : Number(row.retry_after)
    const seconds = Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : 1
    throw new ApiError(429, 'rate_limited', 'Too many requests. Try again soon.', { 'Retry-After': String(seconds) })
}

export async function consumeWriteRateLimit(userId: string): Promise<void> {
    await consumeApiRateLimit(`write:${userId.toLowerCase()}`, WRITE_RATE_LIMIT, WRITE_RATE_WINDOW_SECONDS)
}

export async function consumeSearchRateLimit(
    userId: string | null,
    headerList: { get(name: string): string | null },
): Promise<void> {
    await consumeApiRateLimit(searchBucket(userId, headerList), SEARCH_RATE_LIMIT, SEARCH_RATE_WINDOW_SECONDS)
}
