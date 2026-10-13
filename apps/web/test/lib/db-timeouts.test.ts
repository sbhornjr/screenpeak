import { expect, it } from 'vitest'
import { applySeedPoolTimeouts, poolConnectionTimeouts } from '@/lib/db-timeouts'

it('leaves the app pool on the idle-transaction limit only', () => {
    expect(poolConnectionTimeouts({})).toEqual({ idle_in_transaction_session_timeout: 15_000 })
})

it('applies the seed lock and statement timeouts in milliseconds', () => {
    const env = {}
    applySeedPoolTimeouts(env)
    expect(poolConnectionTimeouts(env)).toEqual({
        idle_in_transaction_session_timeout: 15_000,
        lock_timeout: 5_000,
        statement_timeout: 30_000,
    })
    expect(() => poolConnectionTimeouts({ SCREENPEAK_STATEMENT_TIMEOUT_MS: '30s' })).toThrow(/positive integer/)
})
