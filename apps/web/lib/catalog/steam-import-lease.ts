import type postgres from 'postgres'

/** A run that stops heartbeating is stale after this long and may be replaced. */
export const STEAM_IMPORT_LEASE_TTL_MS = 30_000
export const STEAM_IMPORT_HEARTBEAT_MS = 5_000
/** How long the page waits before asking again while another live run holds the lease. */
export const STEAM_IMPORT_LEASE_RETRY_MS = 5_000

export type LeaseSql = postgres.Sql

const MISSING_LEASE = /steam_import_runs|igdb_private/i

/** The holder of a Steam import. Writes re-check `token` in the same transaction. */
export type SteamImportLease = {
    userId: string
    token: string
    signal: AbortSignal
    /** Refreshes the row. Returns false and aborts `signal` when this token no longer owns it. */
    pulse: () => Promise<boolean>
}

/** Thrown when a heartbeat or a fenced write finds that this token no longer owns the row. */
export class SteamImportLeaseLost extends Error {
    constructor() {
        super('Steam import lease lost')
        this.name = 'SteamImportLeaseLost'
    }
}

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

/**
 * Same token check as the heartbeat, run inside the catalogue or negative-cache
 * transaction so a takeover cannot commit under a token it no longer holds.
 */
export const claimSteamLeaseSql = `update igdb_private.steam_import_runs
    set heartbeat_at = clock_timestamp()
    where user_id = $1::uuid and owner_token = $2::uuid
    returning owner_token`

export const releaseSteamLeaseSql = `delete from igdb_private.steam_import_runs
    where user_id = $1::uuid and owner_token = $2::uuid`

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
