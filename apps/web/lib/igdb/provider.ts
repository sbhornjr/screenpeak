import 'server-only'
import { z } from 'zod'
import { igdbRequest } from './client'
import { GAME_FIELDS, gameSchema, lookupId, positiveId, type IgdbLookups } from './schema'
import { normalizeIgdbGame } from './normalize'
import { IgdbError } from './http'
import { selectTopRatedGames, type RankedIgdbGame } from '../catalog/rank'
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
        // Main games only, ordered by rating_count, then rating, then id.
        // IGDB's documented maximum page is 500. A shorter page is the end of the
        // catalogue only after a cursor probe finds nothing past it. Treating a
        // short page as exhaustion stopped --top at the first response (200 games
        // when the server returned 200 of a requested 500). A full page does not
        // walk every tied rating_count: once `limit` games are strictly better
        // than the next unseen row, the rest cannot change the selection.
        async listTopMainGameIds(limit: number, options: { onProgress?: (progress: { pages: number; collected: number; target: number }) => void } = {}): Promise<number[]> {
            if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new IgdbError('limit must be an integer from 1 to 5000.')
            const lookups = await getLookups()
            const row = z.object({ id: positiveId, rating: z.number().finite(), rating_count: z.number().int().nonnegative() })
            type RankRow = { id: number; rating: number; rating_count: number }
            const candidates: RankedIgdbGame[] = []
            const seen = new Set<number>()
            let pageSize = 500
            const maxPages = 120
            let pages = 0
            const literal = (value: number) => {
                if (!Number.isFinite(value)) throw new IgdbError('top-game ranking saw a non-finite number.')
                return String(value)
            }
            const report = () => options.onProgress?.({ pages, collected: candidates.length, target: limit })
            const request = async (where: string, sort: string, size = pageSize) => {
                if (pages >= maxPages) throw new IgdbError(`top-game ranking stopped after ${pages} pages with ${candidates.length} of ${limit} candidates.`)
                pages += 1
                const body = `fields id,rating,rating_count; where game_type = ${lookups.mainGameTypeId} & rating != null & rating_count != null & ${where}; sort ${sort}; limit ${size};`
                const rows = await transport.request('games', body, z.array(row).max(500))
                report()
                return rows
            }
            const add = (rows: RankRow[]) => {
                for (const item of rows) {
                    if (seen.has(item.id)) continue
                    seen.add(item.id)
                    candidates.push({ id: item.id, rating: item.rating, ratingCount: item.rating_count })
                }
                report()
            }
            const top = () => {
                const ranked = selectTopRatedGames(candidates, limit)
                const edge = ranked[ranked.length - 1]
                return { ids: ranked.map(item => item.id), count: edge?.ratingCount, rating: edge?.rating }
            }
            // A short page is a silent cap when anything remains past its cursor.
            const moreBeyond = async (rows: RankRow[], upper: number | null) => {
                const lowest = Math.min(...rows.map(item => item.rating_count))
                const maxId = Math.max(...rows.filter(item => item.rating_count === lowest).map(item => item.id))
                const below = await request(`rating_count < ${literal(lowest)}`, 'rating_count desc', 1)
                if (below.some(item => item.rating_count >= lowest || (upper != null && item.rating_count >= upper)))
                    throw new IgdbError('top-game rating_count pagination is inconsistent.')
                if (below.length) return true
                const sibling = await request(`rating_count = ${literal(lowest)} & id > ${maxId}`, 'id asc', 1)
                if (sibling.some(item => item.rating_count !== lowest || item.id <= maxId))
                    throw new IgdbError('top-game id pagination is inconsistent.')
                return sibling.length > 0
            }
            // Same rating_count and rating: smaller id wins, so id order can stop once `limit` is full.
            const collectTie = async (count: number, rating: number) => {
                let after = 0
                while (true) {
                    const page = await request(`rating_count = ${literal(count)} & rating = ${literal(rating)} & id > ${after}`, 'id asc')
                    if (page.some(item => item.rating_count !== count || item.rating !== rating || item.id <= after))
                        throw new IgdbError('top-game id pagination is inconsistent.')
                    if (!page.length) return
                    add(page)
                    if (top().ids.length >= limit) return
                    if (page.length < pageSize) return
                    after = page[page.length - 1].id
                }
            }
            const collectBand = async (count: number) => {
                let ratingUpper: number | null = null
                while (true) {
                    const where = ratingUpper == null
                        ? `rating_count = ${literal(count)} & id > 0`
                        : `rating_count = ${literal(count)} & rating < ${literal(ratingUpper)}`
                    const page = await request(where, 'rating desc')
                    if (!page.length) return
                    if (page.some(item => item.rating_count !== count || (ratingUpper != null && item.rating >= ratingUpper)))
                        throw new IgdbError('top-game rating pagination is inconsistent.')
                    const floor = Math.min(...page.map(item => item.rating))
                    const short = page.length < pageSize
                    if (!short) {
                        add(page.filter(item => item.rating > floor))
                        const ranked = top()
                        if (ranked.ids.length >= limit && ranked.rating !== undefined && ranked.rating > floor) return
                        await collectTie(count, floor)
                        if (top().ids.length >= limit) return
                        ratingUpper = floor
                        continue
                    }
                    const maxId = Math.max(...page.filter(item => item.rating === floor).map(item => item.id))
                    const same = await request(`rating_count = ${literal(count)} & rating = ${literal(floor)} & id > ${maxId}`, 'id asc', 1)
                    if (same.some(item => item.rating_count !== count || item.rating !== floor || item.id <= maxId))
                        throw new IgdbError('top-game id pagination is inconsistent.')
                    const lower = await request(`rating_count = ${literal(count)} & rating < ${literal(floor)}`, 'rating desc', 1)
                    if (lower.some(item => item.rating_count !== count || item.rating >= floor))
                        throw new IgdbError('top-game rating pagination is inconsistent.')
                    if (!same.length && !lower.length) {
                        add(page)
                        return
                    }
                    pageSize = page.length
                    add(page.filter(item => item.rating > floor))
                    const ranked = top()
                    if (ranked.ids.length >= limit && ranked.rating !== undefined && ranked.rating > floor) return
                    await collectTie(count, floor)
                    if (top().ids.length >= limit) return
                    ratingUpper = floor
                }
            }
            let upper: number | null = null
            while (true) {
                const rows = await request(upper == null ? 'id > 0' : `rating_count < ${literal(upper)}`, 'rating_count desc')
                if (!rows.length) break
                if (rows.some(item => upper != null && item.rating_count >= upper))
                    throw new IgdbError('top-game rating_count pagination is inconsistent.')
                const short = rows.length < pageSize
                const silentCap = short && await moreBeyond(rows, upper)
                if (silentCap) pageSize = rows.length
                if (!silentCap && short) {
                    add(rows)
                    break
                }
                const lowest = Math.min(...rows.map(item => item.rating_count))
                add(rows.filter(item => item.rating_count > lowest))
                const early = top()
                if (early.ids.length >= limit && early.count !== undefined && lowest < early.count) return early.ids
                await collectBand(lowest)
                const ranked = top()
                if (ranked.ids.length >= limit) return ranked.ids
                if (upper === lowest) throw new IgdbError('top-game rating_count pagination is inconsistent.')
                upper = lowest
            }
            return top().ids
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
