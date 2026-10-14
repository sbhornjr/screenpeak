import { expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => [] as string[])
vi.mock('@/lib/db', () => ({
    db: {
        async transaction(run: (tx: { execute: (query: unknown) => Promise<unknown> }) => Promise<unknown>) {
            await new Promise(resolve => setTimeout(resolve, 400))
            calls.push('transaction')
            return run({
                async execute() {
                    return [{ lease_id: '11111111-1111-4111-8111-111111111111', wait_ms: 0 }]
                },
            })
        },
        async execute() {
            calls.push('update')
            return []
        },
    },
}))

import { acquireIgdbLease } from '@/lib/queries/igdb-budget'

it('starts the 350ms dispatch window after a slow budget round trip', async () => {
    const lease = await acquireIgdbLease('client')
    const remaining = lease.dispatchBefore - performance.now()
    expect(remaining).toBeGreaterThan(0)
    expect(remaining).toBeLessThanOrEqual(350)
    expect(calls).toEqual(['transaction', 'transaction'])
}, 3_000)
