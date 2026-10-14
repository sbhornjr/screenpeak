import { expect, it } from 'vitest'
import { budgetError } from '@/lib/queries/igdb-budget'
import { IgdbError } from '@/lib/igdb/http'
import { idsToSeed, seedOutcome } from '@/lib/catalog/seed'

it('reports a short top-N list instead of treating it as a finished catalogue', () => {
    const ranked = Array.from({ length: 200 }, (_, index) => index + 1)
    const stopped = seedOutcome(2000, ranked, ranked, true)
    expect(stopped.ids).toEqual([])
    expect(stopped.skippedExisting).toHaveLength(200)
    expect(stopped.shortfall).toMatch(/200/)
    expect(stopped.shortfall).toMatch(/2000/)
})

it('recomputes the full top-N set on resume and writes every id that is not stored yet', () => {
    const ranked = Array.from({ length: 2000 }, (_, index) => index + 1)
    const stored = ranked.slice(0, 200)
    const resumed = seedOutcome(2000, ranked, stored, true)
    expect(resumed.shortfall).toBeNull()
    expect(resumed.skippedExisting).toEqual(stored)
    expect(resumed.ids).toEqual(ranked.slice(200))
    expect(idsToSeed(ranked, stored, false).ids).toEqual(ranked)
})

it('names a locked IGDB budget instead of hiding it', () => {
    expect(budgetError(new Error('canceling statement due to lock timeout')).message).toMatch(/--clear-budget/)
    expect(budgetError(new IgdbError('request timed out.', true))).toBeInstanceOf(IgdbError)
    expect(budgetError(new Error('connection refused')).message).toMatch(/unavailable/)
    expect(budgetError(new Error('connection refused')).message).not.toMatch(/--clear-budget/)
})
