import type postgres from 'postgres'

/** Session advisory namespace the previous importer held for a whole batch. */
export const STEAM_IMPORT_LOCK_NAMESPACE = 1936745323
/** A run that stops heartbeating is stale after this long and may be replaced. */
export const STEAM_IMPORT_LEASE_TTL_MS = 30_000
export const STEAM_IMPORT_HEARTBEAT_MS = 5_000
/** How long the page waits before asking again while another live run holds the lease. */
export const STEAM_IMPORT_LEASE_RETRY_MS = 5_000

export type LeaseSql = postgres.Sql

const MISSING_LEASE = /steam_import_runs|igdb_private/i

export const steamLockHoldersSql = `select a.pid, a.backend_start::text as backend_start,
    (a.state like 'idle%' and a.state_change <= clock_timestamp() - ($2::int * interval '1 millisecond')) as stale
    from pg_stat_activity a
    join pg_locks l on l.pid = a.pid
    where l.locktype = 'advisory' and l.granted
      and l.classid = ${STEAM_IMPORT_LOCK_NAMESPACE}::oid
      and l.objid = hashtext($1)
      and a.datname = current_database()
      and a.usename = current_user
      and a.pid <> pg_backend_pid()`

export const terminateSteamLockSql = `select pg_terminate_backend(a.pid) as terminated
    from pg_stat_activity a
    where a.pid = $1
      and a.backend_start::text = $2
      and a.datname = current_database()
      and a.usename = current_user
      and a.pid <> pg_backend_pid()
      and exists (
        select 1 from pg_locks l
        where l.pid = a.pid and l.locktype = 'advisory' and l.granted
          and l.classid = ${STEAM_IMPORT_LOCK_NAMESPACE}::oid
          and l.objid = hashtext($3)
      )`

export const acquireSteamLeaseSql = `insert into igdb_private.steam_import_runs as current_run
    (user_id, owner_token, heartbeat_at, started_at)
    values ($1::uuid, $2::uuid, clock_timestamp(), clock_timestamp())
    on conflict (user_id) do update
    set owner_token = excluded.owner_token,
        heartbeat_at = excluded.heartbeat_at,
        started_at = excluded.started_at
    where current_run.owner_token = excluded.owner_token
       or current_run.heartbeat_at < clock_timestamp() - ($3::int * interval '1 millisecond')
    returning owner_token`

export const heartbeatSteamLeaseSql = `update igdb_private.steam_import_runs
    set heartbeat_at = clock_timestamp()
    where user_id = $1::uuid and owner_token = $2::uuid
    returning owner_token`

export const releaseSteamLeaseSql = `delete from igdb_private.steam_import_runs
    where user_id = $1::uuid and owner_token = $2::uuid`

function pidFrom(value: unknown): number | null {
    const pid = typeof value === 'number' ? value : Number(value)
    return Number.isInteger(pid) && pid > 0 ? pid : null
}

/**
 * A live import holds classid 1936745323 on an idle reserved connection.
 * A holder idle for the lease TTL is a leftover from that importer and is terminated
 * only after pid and backend_start still match. A fresher holder means the
 * old process is still in its turn.
 */
export async function prepareSteamImportLock(db: LeaseSql, userId: string, idleMs = STEAM_IMPORT_LEASE_TTL_MS): Promise<'clear' | 'busy'> {
    const holders = await db.unsafe(steamLockHoldersSql, [userId, idleMs])
    if (holders.some(row => row.stale !== true)) return 'busy'
    for (const row of holders) {
        const pid = pidFrom(row.pid)
        if (!pid || row.backend_start == null || row.backend_start === '') continue
        await db.unsafe(terminateSteamLockSql, [pid, row.backend_start, userId])
    }
    return 'clear'
}

export async function acquireSteamImportLease(db: LeaseSql, userId: string, token: string, ttlMs = STEAM_IMPORT_LEASE_TTL_MS): Promise<boolean> {
    const rows = await db.unsafe(acquireSteamLeaseSql, [userId, token, ttlMs])
    return rows.length > 0
}

export async function heartbeatSteamImportLease(db: LeaseSql, userId: string, token: string): Promise<boolean> {
    const rows = await db.unsafe(heartbeatSteamLeaseSql, [userId, token])
    return rows.length > 0
}

export async function releaseSteamImportLease(db: LeaseSql, userId: string, token: string): Promise<void> {
    await db.unsafe(releaseSteamLeaseSql, [userId, token])
}

export function steamLeaseMissing(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    return MISSING_LEASE.test(message) && /does not exist/i.test(message)
}
