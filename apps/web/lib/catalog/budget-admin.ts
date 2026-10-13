import type postgres from 'postgres'

export type BudgetSql = postgres.Sql

export type ClearedBudget = { terminated: number[]; deletedLeases: number; budgetsReset: number }

function pidFrom(value: unknown): number {
    const pid = typeof value === 'number' ? value : Number(value)
    if (!Number.isInteger(pid) || pid <= 0) throw new Error('Refusing to terminate an unexpected backend id.')
    return pid
}

function countOf(row: Record<string, unknown> | undefined): number {
    const count = Number(row?.n ?? 0)
    if (!Number.isInteger(count) || count < 0) throw new Error('Could not read the IGDB budget clear result.')
    return count
}

/**
 * Sessions left idle in a transaction by Ctrl-C. Advisory locks (catalogue
 * writes) have no relation, so they are matched on locktype. Relation locks
 * on the catalogue or the rate-limit schema are matched by namespace.
 * Excludes this backend. Only sessions idle for more than 15 seconds.
 */
export const stuckBackendSql = `select distinct a.pid
    from pg_stat_activity a
    join pg_locks l on l.pid = a.pid
    left join pg_class c on c.oid = l.relation
    left join pg_namespace n on n.oid = c.relnamespace
    where a.pid <> pg_backend_pid()
      and a.state like 'idle in transaction%'
      and a.state_change < clock_timestamp() - interval '15 seconds'
      and (
        l.locktype = 'advisory'
        or n.nspname in ('igdb_private', 'public')
      )`

/**
 * Drop leftover IGDB rate-limit state. Run only while no seed, audit, or app
 * process is calling IGDB. A killed seed can leave a session idle in a
 * transaction holding `request_budgets` or catalogue advisory locks;
 * the next write waits until that lock is gone.
 */
export async function clearIgdbBudget(sql: BudgetSql): Promise<ClearedBudget> {
    try {
        await sql.unsafe(`select set_config('lock_timeout', '5s', false), set_config('statement_timeout', '15s', false), set_config('idle_in_transaction_session_timeout', '15s', false)`)
        const stuck = await sql.unsafe(stuckBackendSql)
        const terminated: number[] = []
        for (const row of stuck) {
            const pid = pidFrom(row.pid)
            const [result] = await sql.unsafe('select pg_terminate_backend($1) as terminated', [pid])
            if (result?.terminated === true) terminated.push(pid)
        }
        const [deleted] = await sql.unsafe(`with removed as (delete from igdb_private.request_leases returning 1)
            select count(*)::int as n from removed`)
        const [reset] = await sql.unsafe(`with reset as (update igdb_private.request_budgets set next_start_at = '-infinity' returning 1)
            select count(*)::int as n from reset`)
        return { terminated, deletedLeases: countOf(deleted), budgetsReset: countOf(reset) }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/lock timeout|statement timeout/i.test(message))
            throw new Error('Could not clear the IGDB request budget because another session still holds it. Stop every seed and the app, then retry --clear-budget.')
        if (/request_budgets|request_leases|igdb_private/i.test(message) && /does not exist/i.test(message))
            throw new Error('The IGDB request budget is not installed. Apply 0003_igdb_request_budget before --clear-budget.')
        throw error
    }
}
