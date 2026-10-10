import { sql, type SQL } from 'drizzle-orm'

/** Only an authoritative HTTP 200 may become a negative-cache row. 401 and 429 never do. */
export function negativeCacheStatus(httpStatus: number, candidateCount: number): 'unmatched' | 'ambiguous' | null {
    if (httpStatus !== 200) return null
    if (!Number.isInteger(candidateCount) || candidateCount < 0) return null
    if (candidateCount === 0) return 'unmatched'
    if (candidateCount > 1) return 'ambiguous'
    return null
}

type Executor = { execute: (query: SQL) => Promise<unknown> }

export async function writeSteamMatchCache(tx: Executor, input: {
    steamAppId: number
    matcherVersion: string
    httpStatus: number
    candidateCount: number
    checkedAt: string
    retryAfter: string
}): Promise<boolean> {
    const status = negativeCacheStatus(input.httpStatus, input.candidateCount)
    if (!status) return false
    await tx.execute(sql`insert into igdb_private.steam_match_cache
        (steam_app_id, matcher_version, status, checked_at, retry_after)
        values (${input.steamAppId}, ${input.matcherVersion}, ${status}, ${input.checkedAt}::timestamptz, ${input.retryAfter}::timestamptz)
        on conflict (steam_app_id, matcher_version) do update set
            status = excluded.status, checked_at = excluded.checked_at, retry_after = excluded.retry_after`)
    return true
}
