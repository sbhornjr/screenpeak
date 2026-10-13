import { expect, it, vi } from 'vitest'
import { closeDatabasePool, endDatabaseClient } from '@/lib/catalog/close-pool'

it('closes the pool and exits with the seed status', async () => {
    const exit = vi.fn()
    const logs: string[] = []
    const end = vi.fn(async () => undefined)
    await closeDatabasePool({ end }, {
        code: 0, exit, log: line => logs.push(line), now: () => 1_000,
    })
    expect(end).toHaveBeenCalledWith({ timeout: 2 })
    expect(exit).toHaveBeenCalledWith(0)
    expect(logs[0]).toMatch(/closing database pool/)
    expect(logs.at(-1)).toMatch(/database pool closed/)
})

it('exits when the pool never closes', async () => {
    vi.useFakeTimers()
    const exit = vi.fn()
    const logs: string[] = []
    const pending = closeDatabasePool(
        { end: () => new Promise(() => undefined) },
        { code: 1, timeoutMs: 5_000, exit, log: line => logs.push(line), now: () => 0 },
    )
    await vi.advanceTimersByTimeAsync(5_000)
    expect(exit).toHaveBeenCalledWith(1)
    expect(logs.some(line => line.includes('did not close'))).toBe(true)
    await pending
})

it('fails the guard connection when end does not return', async () => {
    vi.useFakeTimers()
    const rejected = endDatabaseClient({ end: () => new Promise(() => undefined) }, 1_000).catch(error => error as Error)
    await vi.advanceTimersByTimeAsync(1_000)
    const error = await rejected
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/did not close/)
})
