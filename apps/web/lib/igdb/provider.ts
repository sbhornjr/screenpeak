import 'server-only'
import { z } from 'zod'
import { igdbRequest } from './client'
import { GAME_FIELDS, gameSchema, lookupId, positiveId, type IgdbLookups } from './schema'
import { normalizeIgdbGame } from './normalize'
import { IgdbError } from './http'
import type { CatalogGame } from '../catalog/types'

type Transport = { request: typeof igdbRequest }
function ids(input: number[]): number[] {
    const result = z.array(positiveId).max(10_000).safeParse(input)
    if (!result.success) throw new IgdbError('IDs must be positive safe integers (at most 10000).')
    return [...new Set(result.data)]
}
function findNamed(rows: { id: number; name: string }[], name: string): number {
    const matches = rows.filter(r => r.name.toLowerCase() === name.toLowerCase())
    if (matches.length !== 1) throw new IgdbError('lookup is missing or ambiguous: ' + name + '.')
    return matches[0].id
}
export function createIgdbProvider(transport: Transport = { request: igdbRequest }) {
    let pending: Promise<IgdbLookups> | undefined
    let loadedAt = 0
    async function table<T extends { id: number }>(endpoint: string, fields: string, schema: z.ZodType<T>) {
        const rows: T[] = []
        let lastId = -1
        for (let offset = 0; offset < 10_000; offset += 500) {
            const page = await transport.request(endpoint, `fields ${fields}; sort id asc; limit 500; offset ${offset};`, z.array(schema).max(500))
            for (const row of page) {
                if (row.id <= lastId) throw new IgdbError('lookup pagination is inconsistent.')
                lastId = row.id; rows.push(row)
            }
            if (page.length < 500) return rows
        }
        throw new IgdbError('lookup pagination exceeded safety limit.')
    }
    async function loadLookups(): Promise<IgdbLookups> {
        const named = z.object({ id: lookupId, name: z.string().min(1) })
        const typed = z.object({ id: lookupId, type: z.string().min(1) })
        const sources = await table('external_game_sources', 'id,name', named)
        const types = await table('game_types', 'id,type', typed)
        const orgs = await table('age_rating_organizations', 'id,name', named)
        const ages = await table('age_rating_categories', 'id,organization,rating', z.object({ id: positiveId, organization: positiveId, rating: z.string().min(1) }))
        const websites = await table('website_types', 'id,type', typed)
        const mainGameTypeId = findNamed(types.map(t => ({ id: t.id, name: t.type })), 'Main Game')
        if (mainGameTypeId !== 0) throw new IgdbError('main-game lookup changed; review the seed policy.')
        const organizationIds = new Set(orgs.map(o => o.id))
        if (ages.some(a => !organizationIds.has(a.organization))) throw new IgdbError('age category lookup references unknown organization.')
        return {
            steamSourceId: findNamed(sources, 'Steam'), mainGameTypeId,
            esrbOrganizationId: findNamed(orgs, 'ESRB'), redditWebsiteTypeId: findNamed(websites.map(w => ({ id: w.id, name: w.type })), 'Subreddit'),
            gameTypes: new Map(types.map(t => [t.id, t.type])),
            ageCategories: new Map(ages.map(a => [a.id, { organization: a.organization, rating: a.rating }])),
        }
    }
    function getLookups() {
        if (!pending || Date.now() - loadedAt >= 86_400_000) {
            loadedAt = Date.now()
            pending = loadLookups().catch(error => { pending = undefined; throw error })
        }
        return pending
    }
    return {
        getLookups,
        async getGamesByIds(input: number[], options: { mainOnly?: boolean } = {}): Promise<CatalogGame[]> {
            const requested = ids(input)
            if (!requested.length) return []
            const lookups = await getLookups(), games: CatalogGame[] = []
            for (let offset = 0; offset < requested.length; offset += 50) {
                const batch = requested.slice(offset, offset + 50)
                const filter = options.mainOnly ? ` & game_type = ${lookups.mainGameTypeId}` : ''
                const page = await transport.request('games', `fields ${GAME_FIELDS}; where id = (${batch.join(',')})${filter}; sort id asc; limit 50;`, z.array(gameSchema).max(50))
                if (options.mainOnly && page.some(g => g.game_type !== lookups.mainGameTypeId)) throw new IgdbError('main-game filter returned another type.')
                if (page.length !== batch.length || new Set(page.map(g => g.id)).size !== page.length || page.some(g => !batch.includes(g.id)))
                    throw new IgdbError('requested game metadata is missing or inconsistent' + (options.mainOnly ? ' after main-game filtering.' : '.'))
                games.push(...page.map(g => normalizeIgdbGame(g, lookups)))
            }
            return games
        },
        async lookupSteamApps(input: number[]): Promise<{ appid: number; candidates: number[] }[]> {
            const requested = ids(input)
            if (!requested.length) return []
            const { steamSourceId } = await getLookups()
            const candidates = new Map(requested.map(id => [id, new Set<number>()]))
            const schema = z.array(z.object({ id: positiveId, uid: z.string(), game: positiveId, external_game_source: positiveId })).max(500)
            for (let start = 0; start < requested.length; start += 100) {
                const batch = requested.slice(start, start + 100)
                let completed = false, lastId = 0
                for (let offset = 0; offset < 50_000; offset += 500) {
                    const body = `fields id,uid,game,external_game_source; where external_game_source = ${steamSourceId} & uid = (${batch.map(id => JSON.stringify(String(id))).join(',')}); sort id asc; limit 500; offset ${offset};`
                    const page = await transport.request('external_games', body, schema)
                    for (const row of page) {
                        const appid = Number(row.uid)
                        if (row.external_game_source !== steamSourceId || !/^[1-9]\d*$/.test(row.uid) || !batch.includes(appid) || row.id <= lastId)
                            throw new IgdbError('unexpected external mapping or inconsistent pagination.')
                        lastId = row.id; candidates.get(appid)!.add(row.game)
                    }
                    if (page.length < 500) { completed = true; break }
                }
                if (!completed) throw new IgdbError('external mapping pagination exceeded safety limit.')
            }
            return requested.map(appid => ({ appid, candidates: [...candidates.get(appid)!].sort((a, b) => a - b) }))
        },
        // Search returns candidates, never a trusted Steam-ID association.
        async searchGames(text: string): Promise<CatalogGame[]> {
            if (typeof text !== 'string' || !text.trim() || text.length > 200) throw new IgdbError('search must contain 1–200 characters.')
            const lookups = await getLookups()
            const games = await transport.request('games', `search ${JSON.stringify(text.trim())}; fields ${GAME_FIELDS}; limit 20;`, z.array(gameSchema).max(20))
            return games.map(g => normalizeIgdbGame(g, lookups))
        },
    }
}
export const igdbProvider = createIgdbProvider()
