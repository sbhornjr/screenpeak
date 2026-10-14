import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

// db (the DB boundary) is mocked with just the two chains getGameReviewsForPage
// builds; each SQL fragment it's handed is rendered with Drizzle's real Postgres
// dialect, so the assertions are about the SQL that would actually run.
const calls: { where?: SQL; orderBy: SQL[]; limit?: number; offset?: number; countWhere?: SQL } = { orderBy: [] }
let rows: unknown[] = []
let total = 0
let fail: Error | null = null

const mockDb = {
    select: vi.fn((fields: Record<string, unknown>) => ({
        from: () => 'count' in fields
            // SELECT count(*) … WHERE …
            ? { where: async (w: SQL) => { calls.countWhere = w; if (fail) throw fail; return [{ count: total }] } }
            // SELECT … JOIN users … WHERE … ORDER BY … LIMIT … OFFSET …
            : { innerJoin: () => ({ where: (w: SQL) => { calls.where = w; return {
                orderBy: (...o: SQL[]) => { calls.orderBy = o; return {
                    limit: (l: number) => { calls.limit = l; return {
                        offset: async (off: number) => { calls.offset = off; if (fail) throw fail; return rows },
                    } },
                } },
            } } }) },
    })),
}
vi.mock('@/lib/db', () => ({ db: mockDb }))

const { getGameReviewsForPage } = await import('@/lib/queries/review')

const dialect = new PgDialect()
const render = (s: SQL) => dialect.sqlToQuery(s)
const ROW = { user_id: 'u-1', rating: 9, review: 'Great', created_at: 't', updated_at: 't', users: { username: 'ana', display_name: 'Ana', avatar_url: 'x' } }
const Q = { page: 1, pageSize: 10, sort: 'date', order: 'desc' } as const

beforeEach(() => {
    Object.assign(calls, { where: undefined, orderBy: [], limit: undefined, offset: undefined, countWhere: undefined })
    rows = [ROW]
    total = 23
    fail = null
})

describe('getGameReviewsForPage', () => {
    it('returns exactly the shared GameReviewsPage shape: reviews, total, totalPages', async () => {
        expect(await getGameReviewsForPage('game-1', { ...Q, page: 2 }, null)).toEqual({
            reviews: [ROW], total: 23, totalPages: 3,
        })
    })

    it('turns page + pageSize into LIMIT / OFFSET', async () => {
        await getGameReviewsForPage('game-1', { ...Q, page: 3, pageSize: 25 }, null)

        expect(calls).toMatchObject({ limit: 25, offset: 50 })
    })

    it('rounds totalPages up, and handles an empty game cleanly', async () => {
        total = 21
        expect(await getGameReviewsForPage('game-1', Q, null)).toMatchObject({ totalPages: 3 })

        rows = []; total = 0
        expect(await getGameReviewsForPage('game-1', Q, null)).toEqual({ reviews: [], total: 0, totalPages: 0 })
    })

    it("signed in, leaves the viewer's own review out of both the page and the count", async () => {
        await getGameReviewsForPage('game-1', Q, 'viewer-1')

        expect(render(calls.where!).params).toContain('viewer-1')
        expect(render(calls.countWhere!).params).toContain('viewer-1')
    })

    it('signed out, filters only by game (and non-empty review text)', async () => {
        await getGameReviewsForPage('game-1', Q, null)

        expect(render(calls.where!).params).toEqual(['game-1', ''])
    })

    it('orders totally for stable paging: rating, then last edited, then row id', async () => {
        await getGameReviewsForPage('game-1', { ...Q, sort: 'rating', order: 'desc' }, null)

        expect(calls.orderBy.map(o => render(o).sql)).toEqual([
            '"ratings_reviews"."rating" desc',
            '"ratings_reviews"."updated_at" desc',
            '"ratings_reviews"."id" asc',
        ])
    })

    it('orders by date with the row id as tie-breaker, honouring the order', async () => {
        await getGameReviewsForPage('game-1', { ...Q, sort: 'date', order: 'asc' }, null)

        expect(calls.orderBy.map(o => render(o).sql)).toEqual([
            '"ratings_reviews"."updated_at" asc',
            '"ratings_reviews"."id" asc',
        ])
    })

    it('throws on a DB error instead of pretending the game has no reviews', async () => {
        fail = new Error('connection terminated')

        await expect(getGameReviewsForPage('game-1', Q, null)).rejects.toThrow('connection terminated')
    })
})
