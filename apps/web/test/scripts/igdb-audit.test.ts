import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { IgdbAuditClient, auditSteam, auditMainGames, parseSteamInput } from '../../scripts/igdb-audit'

const json = (data: unknown, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers })
const game = (id: number, type = 0) => ({
    id, name: 'Game ' + id, slug: 'game-' + id, game_type: type,
    first_release_date: 1431993600, cover: { image_id: 'cover' },
    genres: [{ id: 12, name: 'RPG', slug: 'rpg' }], platforms: [{ id: 6, name: 'PC', slug: 'pc' }],
    involved_companies: [{ developer: true, publisher: true, company: { id: 1, name: 'Studio', slug: 'studio' } }],
    age_ratings: [{ organization: { id: 1, name: 'ESRB' }, rating_category: { id: 6, rating: 'M' } }],
})
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-07T12:00:00Z')) })
afterEach(() => vi.useRealTimers())
async function finish<T>(promise: Promise<T>): Promise<T> {
    const settled = promise.then(value => ({ value }), error => ({ error }))
    await vi.runAllTimersAsync()
    const result = await settled
    if ('error' in result) throw result.error
    return result.value
}
function client() { return new IgdbAuditClient('client', 'secret') }
function mockApi(handler: (endpoint: string, body: string) => Response) {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
        const parsed = new URL(url)
        if (parsed.hostname === 'id.twitch.tv') {
            expect(parsed.searchParams.get('grant_type')).toBe('client_credentials')
            expect(parsed.searchParams.get('client_secret')).toBe('secret')
            return json({ access_token: 'private-token', expires_in: 3600, token_type: 'bearer' })
        }
        expect(new Headers(init.headers).get('Authorization')).toBe('Bearer private-token')
        return handler(parsed.pathname.split('/').at(-1)!, String(init.body))
    }))
}
it('validates Steam exports, deduplicates apps and rejects hidden/invalid libraries', () => {
    expect(parseSteamInput({ response: { games: [{ appid: 1, name: 'A' }, { appid: 1, name: 'A' }] } })).toEqual([{ appid: 1, name: 'A' }])
    expect(parseSteamInput({ response: { game_count: 0 } })).toEqual([])
    expect(() => parseSteamInput({ response: {} })).toThrow()
    expect(() => parseSteamInput([{ appid: -1 }])).toThrow()
})
it('reports exact, ambiguous and absent mappings without filtering Steam editions', async () => {
    mockApi((endpoint, body) => {
        if (endpoint === 'external_game_sources') return json([{ id: 1, name: 'Steam' }])
        if (endpoint === 'external_games') return json([
            { id: 1, uid: '10', game: 100, external_game_source: 1 },
            { id: 2, uid: '10', game: 100, external_game_source: 1 },
            { id: 3, uid: '20', game: 200, external_game_source: 1 },
            { id: 4, uid: '20', game: 201, external_game_source: 1 },
            { id: 5, uid: '40', game: 100, external_game_source: 1 },
        ])
        expect(body).not.toContain('game_type = 0')
        return json([game(100, 3), game(200), game(201)])
    })
    const report = await finish(auditSteam(client(), [{ appid: 10 }, { appid: 20 }, { appid: 30 }, { appid: 40 }]))
    expect(report.results.map(r => r.status)).toEqual(['matched', 'ambiguous', 'unmatched', 'matched'])
    expect(report.summary).toMatchObject({ total: 4, exactMatches: 2, ambiguous: 1, unmatched: 1, errors: 0, coveragePercent: 50 })
    expect(report.sharedGames).toEqual([{ igdbId: 100, appids: [10, 40] }])
    expect(JSON.stringify(report)).not.toContain('private-token')
    expect(report.results[0].metadata?.[0]).toMatchObject({ released: '2015-05-19', gameType: 3, esrb: ['M'] })
})
it('paginates external mappings before declaring an app unambiguous', async () => {
    mockApi((endpoint, body) => {
        if (endpoint === 'external_game_sources') return json([{ id: 1, name: 'Steam' }])
        if (endpoint === 'external_games') return body.includes('offset 500')
            ? json([{ id: 501, uid: '10', game: 101, external_game_source: 1 }])
            : json(Array.from({ length: 500 }, (_, i) => ({ id: i + 1, uid: '10', game: 100, external_game_source: 1 })))
        return json([game(100), game(101)])
    })
    const report = await finish(auditSteam(client(), [{ appid: 10 }]))
    expect(report.results[0]).toMatchObject({ status: 'ambiguous', candidates: [100, 101] })
})
it('does not turn upstream failure or malformed payloads into unmatched results', async () => {
    mockApi(endpoint => endpoint === 'external_game_sources' ? json([{ id: 1, name: 'Steam' }]) : json({ leaked: 'secret' }, 503))
    const report = await finish(auditSteam(client(), [{ appid: 10 }]))
    expect(report.summary).toMatchObject({ unmatched: 0, errors: 1, coveragePercent: null })
    expect(JSON.stringify(report)).not.toContain('secret')
})
it('retains exact mapping coverage when metadata hydration fails', async () => {
    mockApi(endpoint => {
        if (endpoint === 'external_game_sources') return json([{ id: 1, name: 'Steam' }])
        if (endpoint === 'external_games') return json([{ id: 1, uid: '10', game: 100, external_game_source: 1 }])
        return json([{ id: 100, name: 123 }])
    })
    const report = await finish(auditSteam(client(), [{ appid: 10 }]))
    expect(report.summary).toMatchObject({ exactMatches: 1, coveragePercent: 100, metadataErrors: 1 })
    expect(report.results[0].metadataError).toBeTruthy()
})
it('main catalogue samples enforce main-game filtering and flag missing metadata', async () => {
    mockApi((endpoint, body) => {
        expect(endpoint).toBe('games')
        expect(body).toContain('game_type = 0')
        return json([{ id: 100, name: 'Sparse', game_type: 0 }])
    })
    const report = await finish(auditMainGames(client(), 1))
    expect(report.games[0].missing).toContain('cover')
    expect(report.games[0].missing).toContain('released')
    expect(report.games[0].released).toBeNull()
})
it('refreshes an invalid token once and spaces outgoing API attempts', async () => {
    let tokens = 0, attempts = 0
    const starts: number[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (new URL(url).hostname === 'id.twitch.tv') {
            tokens++
            return json({ access_token: 'token-' + tokens, expires_in: 3600, token_type: 'bearer' })
        }
        starts.push(Date.now())
        return ++attempts === 1 ? json({}, 401) : json([])
    }))
    const c = client()
    const report = await finish(auditMainGames(c, 1))
    expect(report.games).toEqual([])
    expect(tokens).toBe(2)
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(300)
    expect(c.stats.authRequests).toBe(2)
})
it('honors Retry-After and bounds repeated unauthorized responses', async () => {
    let attempts = 0
    const starts: number[] = []
    mockApi(() => {
        starts.push(Date.now())
        return ++attempts === 1 ? json({}, 429, { 'Retry-After': '2' }) : json([])
    })
    await finish(auditMainGames(client(), 1))
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(2000)
    mockApi(() => json({}, 401))
    await expect(finish(auditMainGames(client(), 1))).rejects.toThrow(/401/)
})

it('audits supplied image URLs and builds display renditions without accepting mismatched IDs', async () => {
    mockApi((_endpoint, body) => {
        expect(body).toContain('cover.url')
        expect(body).toContain('screenshots.url')
        return json([{
            ...game(100),
            cover: { image_id: 'co123', url: '//images.igdb.com/igdb/image/upload/t_thumb/co123.jpg' },
            screenshots: [
                { image_id: 'sc123', url: '//images.igdb.com/igdb/image/upload/t_thumb/sc123.jpg' },
                { image_id: 'different', url: '//images.igdb.com/igdb/image/upload/t_thumb/sc456.jpg' },
            ],
        }])
    })
    const report = await finish(auditMainGames(client(), 1))
    expect(report.games[0].coverSourceUrl).toBe('https://images.igdb.com/igdb/image/upload/t_thumb/co123.jpg')
    expect(report.games[0].coverUrl).toBe('https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co123.jpg')
    expect(report.games[0].screenshots[0].displayUrl).toBe('https://images.igdb.com/igdb/image/upload/t_screenshot_huge/sc123.jpg')
    expect(report.games[0].screenshots[1].issue).toBe('image_id does not match URL')
    expect(report.games[0].screenshots[1].displayUrl).toBeNull()
})
it('accepts a usable supplied URL without image_id and rejects unrelated image hosts', async () => {
    mockApi(() => json([{
        ...game(100),
        cover: { url: '//images.igdb.com/igdb/image/upload/t_thumb/co123.jpg' },
        screenshots: [{ image_id: 'sc123', url: 'https://unrelated.example/sc123.jpg' }],
    }]))
    const report = await finish(auditMainGames(client(), 1))
    expect(report.games[0].coverUrl).toContain('co123.jpg')
    expect(report.games[0].screenshots[0].displayUrl).toBeNull()
    expect(report.games[0].imageIssues).toContain('screenshots[0]: invalid IGDB image URL')
})
