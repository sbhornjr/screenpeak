import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// GET /api/v1/games/[slug]/reviews: auth → validate query → slug → id →
// getGameReviewsForPage → JSON. Auth and the two queries are mocked (each is
// tested on its own); the query-param parser is the real one — validation is
// this route's job.
const getOptionalUser = vi.fn()
const getGameIdBySlug = vi.fn()
const getGameReviewsForPage = vi.fn()
vi.mock('@/lib/auth', () => ({ getOptionalUser }))
vi.mock('@/lib/queries/game', () => ({ getGameIdBySlug }))
vi.mock('@/lib/queries/review', () => ({ getGameReviewsForPage }))

const { GET } = await import('@/app/api/v1/games/[slug]/reviews/route')
const { UnauthenticatedError } = await import('@/lib/api')

const PAGE = { reviews: [], total: 0, totalPages: 0 }
const call = (slug: string, qs = '') =>
    GET(new NextRequest(`http://localhost/api/v1/games/${slug}/reviews${qs}`), { params: Promise.resolve({ slug }) })

beforeEach(() => {
    getOptionalUser.mockReset().mockResolvedValue(null)
    getGameIdBySlug.mockReset().mockResolvedValue('game-1')
    getGameReviewsForPage.mockReset().mockResolvedValue(PAGE)
})

describe('GET /api/v1/games/[slug]/reviews', () => {
    it('returns the page as JSON, with defaults for a bare request', async () => {
        const res = await call('baldurs-gate-3')

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual(PAGE)
        expect(getGameIdBySlug).toHaveBeenCalledWith('baldurs-gate-3')
        expect(getGameReviewsForPage).toHaveBeenCalledWith('game-1', { page: 1, pageSize: 10, sort: 'date', order: 'desc' }, null)
    })

    it('passes the parsed query and the viewer through', async () => {
        getOptionalUser.mockResolvedValue({ id: 'viewer-1', email: null })

        await call('baldurs-gate-3', '?page=2&pageSize=25&sort=rating&order=asc')

        expect(getGameReviewsForPage).toHaveBeenCalledWith('game-1', { page: 2, pageSize: 25, sort: 'rating', order: 'asc' }, 'viewer-1')
    })

    it('is never stored by a shared cache (the page depends on who is asking)', async () => {
        expect((await call('baldurs-gate-3')).headers.get('cache-control')).toBe('private, no-store')
    })

    it('rejects an out-of-range parameter with 400 invalid_request, before any lookup', async () => {
        const res = await call('baldurs-gate-3', '?pageSize=500')

        expect(res.status).toBe(400)
        const { error } = await res.json()
        expect(error.code).toBe('invalid_request')
        expect(error.message).toContain('pageSize')
        expect(getGameIdBySlug).not.toHaveBeenCalled()
    })

    it('answers an unknown slug with 404 not_found', async () => {
        getGameIdBySlug.mockResolvedValue(null)

        const res = await call('nope')

        expect(res.status).toBe(404)
        expect((await res.json()).error.code).toBe('not_found')
        expect(getGameReviewsForPage).not.toHaveBeenCalled()
    })

    it('rejects a bad bearer token with 401', async () => {
        getOptionalUser.mockRejectedValue(new UnauthenticatedError('invalid_token'))

        const res = await call('baldurs-gate-3')

        expect(res.status).toBe(401)
        expect(getGameReviewsForPage).not.toHaveBeenCalled()
    })

    it('answers a DB error with 500 internal — never an empty page that looks like "no reviews"', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        getGameReviewsForPage.mockRejectedValue(new Error('connection terminated'))

        const res = await call('baldurs-gate-3')

        expect(res.status).toBe(500)
        const body = await res.json()
        expect(body.error.code).toBe('internal')
        expect(JSON.stringify(body)).not.toContain('connection terminated')
    })
})
