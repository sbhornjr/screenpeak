import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { ApiError, UnauthenticatedError } from '@/lib/api'

const getBearerUser = vi.fn()
const searchGamesByName = vi.fn()
const searchTaxonomyTable = vi.fn()
const consumeSearchRateLimit = vi.fn()

vi.mock('@/lib/auth', () => ({ getBearerUser, requireBearerUser: vi.fn() }))
vi.mock('@/lib/queries/game', () => ({ searchGamesByName, searchTaxonomyTable }))
vi.mock('@/lib/rate-limit', () => ({ consumeSearchRateLimit }))

const games = await import('@/app/api/v1/games/search/route')
const taxonomy = await import('@/app/api/v1/taxonomy/[table]/search/route')

const GAME = '11111111-1111-4111-8111-111111111111'
const DEV = '22222222-2222-4222-8222-222222222222'
const noCtx = { params: Promise.resolve({}) }
const tableCtx = (table: string) => ({ params: Promise.resolve({ table }) })

beforeEach(() => {
    getBearerUser.mockReset().mockResolvedValue(null)
    searchGamesByName.mockReset()
    searchTaxonomyTable.mockReset()
    consumeSearchRateLimit.mockReset().mockResolvedValue(undefined)
    searchGamesByName.mockResolvedValue([{
        id: GAME,
        name: 'Hades',
        slug: 'hades',
        cover_image_url: 'https://images.igdb.com/igdb/image/upload/t_thumb/co123.jpg',
        released: '2020-09-17',
        avg_rating: 9.2,
    }])
    searchTaxonomyTable.mockResolvedValue([{ id: DEV, name: 'Supergiant', slug: 'supergiant' }])
})

describe('GET /api/v1/games/search', () => {
    it('returns display-ready hits for a signed-out caller', async () => {
        const res = await games.GET(new NextRequest('http://localhost/api/v1/games/search?q=hades'), noCtx)
        expect(res.status).toBe(200)
        expect(res.headers.get('cache-control')).toBe('private, no-store')
        const body = await res.json()
        expect(body).toEqual({
            games: [{
                id: GAME,
                name: 'Hades',
                slug: 'hades',
                cover_image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co123.jpg',
                released: '2020-09-17',
                avg_rating: 9.2,
            }],
        })
        expect(JSON.stringify(body)).not.toContain('avg_ngplus_rating')
        expect(JSON.parse(JSON.stringify(body))).toEqual(body)
        expect(searchGamesByName).toHaveBeenCalledWith('hades', 20)
        expect(consumeSearchRateLimit).toHaveBeenCalledWith(null, expect.any(Headers))
    })

    it('rejects an empty or oversized query before the rate limit or the database', async () => {
        const empty = await games.GET(new NextRequest('http://localhost/api/v1/games/search?q='), noCtx)
        expect(empty.status).toBe(400)
        expect((await empty.json()).error.code).toBe('invalid_request')

        const huge = await games.GET(new NextRequest('http://localhost/api/v1/games/search?q=hades&limit=21'), noCtx)
        expect(huge.status).toBe(400)
        expect(searchGamesByName).not.toHaveBeenCalled()
        expect(consumeSearchRateLimit).not.toHaveBeenCalled()
    })

    it('fails closed on a bad bearer and turns a spent budget into 429', async () => {
        getBearerUser.mockRejectedValueOnce(new UnauthenticatedError('invalid_token'))
        const bad = await games.GET(new NextRequest('http://localhost/api/v1/games/search?q=hades'), noCtx)
        expect(bad.status).toBe(401)
        expect((await bad.json()).error.code).toBe('invalid_token')
        expect(searchGamesByName).not.toHaveBeenCalled()
        expect(consumeSearchRateLimit).not.toHaveBeenCalled()

        consumeSearchRateLimit.mockRejectedValueOnce(new ApiError(429, 'rate_limited', 'Too many requests. Try again soon.', { 'Retry-After': '8' }))
        const limited = await games.GET(new NextRequest('http://localhost/api/v1/games/search?q=hades'), noCtx)
        expect(limited.status).toBe(429)
        expect(limited.headers.get('retry-after')).toBe('8')
        expect((await limited.json()).error.code).toBe('rate_limited')
        expect(searchGamesByName).not.toHaveBeenCalled()
    })

    it('answers a database error with 500 and does not describe it as no matches', async () => {
        searchGamesByName.mockRejectedValueOnce(new Error('database unavailable'))
        const res = await games.GET(new NextRequest('http://localhost/api/v1/games/search?q=hades'), noCtx)
        expect(res.status).toBe(500)
        const body = await res.json()
        expect(body.error.code).toBe('internal')
        expect(JSON.stringify(body)).not.toContain('database unavailable')
    })
})

describe('GET /api/v1/taxonomy/[table]/search', () => {
    it('searches developers signed out and rejects genres', async () => {
        const res = await taxonomy.GET(
            new NextRequest(`http://localhost/api/v1/taxonomy/developers/search?q=super&ids=${DEV}`),
            tableCtx('developers'),
        )
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ results: [{ id: DEV, name: 'Supergiant', slug: 'supergiant' }] })
        expect(searchTaxonomyTable).toHaveBeenCalledWith('developers', 'super', [DEV], 20)

        const bad = await taxonomy.GET(new NextRequest('http://localhost/api/v1/taxonomy/genres/search?q=rpg'), tableCtx('genres'))
        expect(bad.status).toBe(400)
        expect((await bad.json()).error.code).toBe('invalid_request')
    })
})
