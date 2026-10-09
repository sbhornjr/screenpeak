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
                // DB grant occurs after `before`; this conservative local deadline
                // avoids depending on synchronized host clocks or delayed reservations.
                const dispatchBefore = before + 350
                if (performance.now() < dispatchBefore) return { dispatchBefore, release }
                await release()
            } else await wait(Math.min(Math.max(10, row.wait_ms), 1000))
        }
    } catch { throw new IgdbError('shared request budget unavailable.') }
    throw new IgdbError('shared request budget busy; retry later.')
}
