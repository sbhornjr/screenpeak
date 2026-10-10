import 'server-only'
import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '../db'
import type { IgdbLease } from '../igdb/client'
import { IgdbError, wait } from '../igdb/http'

export async function acquireIgdbLease(clientId: string): Promise<IgdbLease> {
    const key = createHash('sha256').update(clientId).digest('hex')
    const deadline = performance.now() + 30_000
    try {
        while (performance.now() < deadline) {
            const before = performance.now()
            const result = await db.transaction(async tx => {
                await tx.execute(sql`set local statement_timeout = '2s'`)
                await tx.execute(sql`set local lock_timeout = '1s'`)
                return tx.execute(sql`select * from igdb_private.acquire_request_lease(${key})`)
            })
            const roundTripMs = Math.min(10_000, Math.max(0, Math.ceil(performance.now() - before)))
            const row = result[0] as { lease_id: string | null; wait_ms: number }
            if (row.lease_id) {
                const release = async () => {
                    try {
                        await db.transaction(async tx => {
                            await tx.execute(sql`set local statement_timeout = '2s'`)
                            await tx.execute(sql`select igdb_private.release_request_lease(${key},${row.lease_id}::uuid)`)
                        })
                    } catch { throw new IgdbError('shared request budget unavailable.') }
                }
                try {
                    // The 350ms dispatch window starts once the grant is in hand.
                    // Push the next reservation by this round trip so a slow tunnel
                    // still leaves at least 300ms before the following grant.
                    await db.execute(sql`update igdb_private.request_budgets
                        set next_start_at = greatest(next_start_at, clock_timestamp()
                            + (${roundTripMs} * interval '1 millisecond') + interval '650 milliseconds')
                        where credential_key = ${key}`)
                } catch {
                    await release()
                    throw new IgdbError('shared request budget unavailable.')
                }
                const dispatchBefore = performance.now() + 350
                if (performance.now() < dispatchBefore) return { dispatchBefore, release }
                await release()
            } else await wait(Math.min(Math.max(10, row.wait_ms), 1000))
        }
    } catch { throw new IgdbError('shared request budget unavailable.') }
    throw new IgdbError('shared request budget busy; retry later.')
}
