import { describe, it, expect } from 'vitest'
import { parseGameReviewsQuery, parseGameReviewsQueryLenient } from '@/lib/game-reviews-query'

const DEFAULTS = { page: 1, pageSize: 10, sort: 'date', order: 'desc' }
const params = (o: Record<string, string>) => new URLSearchParams(o)

describe('parseGameReviewsQuery (strict — the API)', () => {
    it('defaults every parameter: page 1, 10 per page, newest first', () => {
        expect(parseGameReviewsQuery(params({}))).toEqual({ ok: true, query: DEFAULTS })
    })

    it('reads numbers from the URL strings', () => {
        expect(parseGameReviewsQuery(params({ page: '3', pageSize: '25', sort: 'rating', order: 'asc' })))
            .toEqual({ ok: true, query: { page: 3, pageSize: 25, sort: 'rating', order: 'asc' } })
    })

    it('allows up to the web menu’s largest page size (100)', () => {
        expect(parseGameReviewsQuery(params({ pageSize: '100' }))).toMatchObject({ ok: true, query: { pageSize: 100 } })
    })

    it.each([
        [{ page: '0' }, 'page'],
        [{ page: '1.5' }, 'page'],
        [{ page: 'abc' }, 'page'],
        [{ pageSize: '0' }, 'pageSize'],
        [{ pageSize: '101' }, 'pageSize'],
        [{ sort: 'popularity' }, 'sort'],
        [{ order: 'up' }, 'order'],
    ])('rejects %j, naming the parameter', (input, name) => {
        const result = parseGameReviewsQuery(params(input))

        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.message).toContain(name)
    })
})

describe('parseGameReviewsQueryLenient (the website — hand-edited URLs)', () => {
    it('falls back per parameter, keeping the valid ones', () => {
        expect(parseGameReviewsQueryLenient({ page: '3', pageSize: '9999', sort: 'bogus', order: 'asc' }))
            .toEqual({ page: 3, pageSize: 10, sort: 'date', order: 'asc' })
    })

    it('defaults an empty query', () => {
        expect(parseGameReviewsQueryLenient({})).toEqual(DEFAULTS)
    })
})
