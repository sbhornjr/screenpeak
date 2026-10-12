import 'server-only'
import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '../db'
import type { IgdbLease } from '../igdb/client'
import { IgdbError, wait } from '../igdb/http'

export function budgetError(error: unknown): IgdbError {
    if (error instanceof IgdbError) return error
    const message = error instanceof Error ? error.message : ''
    if (/lock timeout|statement timeout|idle-in-transaction/i.test(message))
        return new IgdbError('shared request budget is locked by another session. Run seed:igdb with --clear-budget while no other IGDB command is running.')
    return new IgdbError('shared request budget unavailable.')
}

async function bounded(query: ReturnType<typeof sql>) {
    return db.transaction(async tx => {
        await tx.execute(sql`set local statement_timeout = '2s'`)
        await tx.execute(sql`set local lock_timeout = '1s'`)
        await tx.execute(sql`set local idle_in_transaction_session_timeout = '15s'`)
        return tx.execute(query)
    })
}

export async function acquireIgdbLease(clientId: string): Promise<IgdbLease> {
    const key = createHash('sha256').update(clientId).digest('hex')
    const deadline = performance.now() + 30_000
    try {
        while (performance.now() < deadline) {
            const before = performance.now()
            const result = await bounded(sql`select * from igdb_private.acquire_request_lease(${key})`)
            const roundTripMs = Math.min(10_000, Math.max(0, Math.ceil(performance.now() - before)))
            const row = result[0] as { lease_id: string | null; wait_ms: number } | undefined
            if (row?.lease_id) {
                const leaseId = row.lease_id
                const release = async () => {
                    try {
                        await bounded(sql`select igdb_private.release_request_lease(${key},${leaseId}::uuid)`)
                    } catch (error) { throw budgetError(error) }
                }
                try {
                    // The 350ms dispatch window starts once the grant is in hand.
                    // Push the next reservation by this round trip so a slow tunnel
                    // still leaves at least 300ms before the following grant.
                    // This used to be an unbounded update: a leftover FOR UPDATE
                    // from a killed process hung it until Ctrl-C.
                    await bounded(sql`update igdb_private.request_budgets
                        set next_start_at = greatest(next_start_at, clock_timestamp()
                            + (${roundTripMs} * interval '1 millisecond') + interval '650 milliseconds')
                        where credential_key = ${key}`)
                } catch (error) {
                    await release()
                    throw budgetError(error)
                }
                const dispatchBefore = performance.now() + 350
                if (performance.now() < dispatchBefore) return { dispatchBefore, release }
                await release()
            } else await wait(Math.min(Math.max(10, row?.wait_ms ?? 1000), 1000))
        }
    } catch (error) { throw budgetError(error) }
    throw new IgdbError('shared request budget busy; retry later.')
}
