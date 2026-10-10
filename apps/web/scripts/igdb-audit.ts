import { z } from 'zod'

const positiveId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const taxon = z.object({ id: positiveId, name: z.string(), slug: z.string().optional() })
const picture = z.object({ image_id: z.string().optional(), url: z.string().optional(), width: z.number().optional(), height: z.number().optional() })
const gameSchema = z.object({
    id: positiveId, name: z.string(), slug: z.string().optional(),
    game_type: z.number().int().nonnegative().optional(),
    first_release_date: z.number().int().nonnegative().max(253402300799).optional(),
    summary: z.string().optional(), updated_at: z.number().optional(),
    genres: z.array(taxon).optional(), platforms: z.array(taxon).optional(),
    cover: picture.optional(), screenshots: z.array(picture).optional(), artworks: z.array(picture).optional(),
    involved_companies: z.array(z.object({
        developer: z.boolean().optional(), publisher: z.boolean().optional(),
        company: taxon.optional(),
    })).optional(),
    age_ratings: z.array(z.object({
        organization: z.object({ id: positiveId, name: z.string() }),
        rating_category: z.object({ id: positiveId, rating: z.string() }).optional(),
    })).optional(),
})
type Game = z.infer<typeof gameSchema>
export type SteamInput = { appid: number; name?: string }
export class AuditError extends Error {}

export function parseSteamInput(input: unknown): SteamInput[] {
    let rows = input
    if (!Array.isArray(rows) && rows && typeof rows === 'object') {
        const outer = rows as Record<string, unknown>
        const envelope = outer.response ?? outer
        if (!envelope || typeof envelope !== 'object') throw new AuditError('Invalid Steam export.')
        const library = envelope as Record<string, unknown>
        rows = library.games ?? (library.game_count === 0 ? [] : undefined)
    }
    const parsed = z.array(z.object({ appid: positiveId, name: z.string().optional() })).safeParse(rows)
    if (!parsed.success) throw new AuditError('Expected an array of { appid, name? } or a public Steam GetOwnedGames export. Missing/private libraries are not empty libraries.')
    return [...new Map(parsed.data.map(g => [g.appid, g])).values()]
}

const FIELDS = [
    'id', 'name', 'slug', 'game_type', 'summary', 'first_release_date', 'updated_at',
    'genres.id', 'genres.name', 'genres.slug', 'platforms.id', 'platforms.name', 'platforms.slug',
    'involved_companies.developer', 'involved_companies.publisher',
    'involved_companies.company.id', 'involved_companies.company.name', 'involved_companies.company.slug',
    'cover.image_id', 'cover.url', 'screenshots.image_id', 'screenshots.url', 'artworks.image_id', 'artworks.url', 'artworks.width', 'artworks.height',
    'age_ratings.organization.id', 'age_ratings.organization.name',
    'age_ratings.rating_category.id', 'age_ratings.rating_category.rating',
].join(',')
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export type AuditBudget = { acquire(clientId: string): Promise<{ dispatchBefore: number; release(): Promise<void> }> }
const sharedBudget: AuditBudget = {
    async acquire(clientId) { return (await import('../lib/queries/igdb-budget')).acquireIgdbLease(clientId) },
}

export class IgdbAuditClient {
    readonly stats = { authRequests: 0, apiRequests: 0, retries: 0, byEndpoint: {} as Record<string, number> }
    private token = ''
    private expiresAt = 0
    private readonly budget: AuditBudget

    constructor(private readonly clientId: string, private readonly clientSecret: string, budget?: AuditBudget) {
        if (!clientId.trim() || !clientSecret.trim()) throw new AuditError('Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in apps/web/.env.local or the environment.')
        this.budget = budget ?? sharedBudget
    }

    private async request(url: string, init: RequestInit, endpoint: string): Promise<Response> {
        let lease: { release(): Promise<void> } | undefined
        if (endpoint !== 'oauth') {
            let acquired: { dispatchBefore: number; release(): Promise<void> }
            try { acquired = await this.budget.acquire(this.clientId) }
            catch { throw new AuditError('shared request budget unavailable.') }
            if (Date.now() >= acquired.dispatchBefore) {
                try { await acquired.release() } catch { throw new AuditError('shared request budget unavailable.') }
                throw new AuditError('request reservation expired; retry later.')
            }
            lease = acquired
        }
        if (endpoint === 'oauth') this.stats.authRequests++
        else {
            this.stats.apiRequests++
            this.stats.byEndpoint[endpoint] = (this.stats.byEndpoint[endpoint] ?? 0) + 1
        }
        try {
            return await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(10_000) })
        } catch {
            // Never propagate fetch errors containing URLs, OAuth params or headers.
            throw new AuditError(endpoint + ' request failed or timed out.')
        } finally {
            if (lease) {
                try { await lease.release() } catch { throw new AuditError('shared request budget unavailable.') }
            }
        }
    }

    private async backoff(response: Response | undefined, attempt: number) {
        let ms = 500 * 2 ** attempt
        const after = response?.headers.get('retry-after')
        if (after) {
            const seconds = Number(after)
            const parsed = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(after) - Date.now()
            if (Number.isFinite(parsed)) ms = Math.max(ms, parsed)
        }
        // Fail instead of retrying earlier than a long provider cooldown.
        if (ms > 30_000) throw new AuditError('Provider requested a cooldown longer than 30 seconds; retry the audit later.')
        this.stats.retries++
        await sleep(ms)
    }

    private async authenticate(): Promise<void> {
        if (this.token && Date.now() < this.expiresAt) return
        const url = new URL('https://id.twitch.tv/oauth2/token')
        url.search = new URLSearchParams({
            client_id: this.clientId, client_secret: this.clientSecret, grant_type: 'client_credentials',
        }).toString()
        for (let attempt = 0; attempt < 3; attempt++) {
            let response: Response
            try { response = await this.request(url.toString(), { method: 'POST' }, 'oauth') }
            catch (error) {
                if (attempt === 2) throw error
                await this.backoff(undefined, attempt); continue
            }
            if (!response.ok) {
                if ((response.status === 429 || response.status >= 500) && attempt < 2) {
                    await this.backoff(response, attempt); continue
                }
                throw new AuditError('OAuth HTTP ' + response.status + '. Check Twitch credentials.')
            }
            const parsed = z.object({
                access_token: z.string().min(1), expires_in: z.number().positive(), token_type: z.string(),
            }).safeParse(await response.json().catch(() => null))
            if (!parsed.success || parsed.data.token_type.toLowerCase() !== 'bearer')
                throw new AuditError('OAuth returned an invalid token response.')
            this.token = parsed.data.access_token
            this.expiresAt = Date.now() + Math.max(0, parsed.data.expires_in - 60) * 1000
            return
        }
    }

    async query<T>(endpoint: 'games' | 'external_games' | 'external_game_sources', body: string, schema: z.ZodType<T>): Promise<T> {
        let refreshed = false
        for (let attempt = 0; attempt < 3; attempt++) {
            await this.authenticate()
            let response: Response
            try {
                response = await this.request('https://api.igdb.com/v4/' + endpoint, {
                    method: 'POST', headers: {
                        'Client-ID': this.clientId, Authorization: 'Bearer ' + this.token,
                        Accept: 'application/json', 'Content-Type': 'text/plain',
                    }, body,
                }, endpoint)
            } catch (error) {
                if (attempt === 2) throw error
                await this.backoff(undefined, attempt); continue
            }
            if (response.status === 401 && !refreshed && attempt < 2) {
                this.token = ''; refreshed = true; this.stats.retries++; continue
            }
            if (!response.ok) {
                if ((response.status === 429 || response.status >= 500) && attempt < 2) {
                    await this.backoff(response, attempt); continue
                }
                throw new AuditError(endpoint + ' HTTP ' + response.status + '.')
            }
            const parsed = schema.safeParse(await response.json().catch(() => null))
            if (!parsed.success) throw new AuditError(endpoint + ' returned an invalid response.')
            return parsed.data
        }
        throw new AuditError(endpoint + ' exhausted retries.')
    }
}

function describeImage(image: z.infer<typeof picture>, rendition: string) {
    let sourceUrl: string | null = null
    let displayUrl: string | null = null
    let issue: string | null = null
    try {
        if (!image.url) throw new Error()
        const url = new URL(image.url.startsWith('//') ? 'https:' + image.url : image.url)
        const match = url.pathname.match(/^\/igdb\/image\/upload\/t_[a-zA-Z0-9_]+\/([a-zA-Z0-9_-]+)\.(jpg|png|webp)$/)
        if (url.protocol !== 'https:' || url.hostname !== 'images.igdb.com' || url.port ||
            url.username || url.password || url.search || url.hash || !match) throw new Error()
        sourceUrl = url.toString()
        if (image.image_id && image.image_id !== match[1]) issue = 'image_id does not match URL'
        else {
            url.pathname = '/igdb/image/upload/t_' + rendition + '/' + match[1] + '.' + match[2]
            displayUrl = url.toString()
        }
    } catch { issue = image.url ? 'invalid IGDB image URL' : 'missing supplied URL' }
    return { imageId: image.image_id ?? null, sourceUrl, displayUrl, issue }
}

function describe(game: Game) {
    const cover = game.cover ? describeImage(game.cover, 'cover_big_2x') : null
    const screenshots = (game.screenshots ?? []).map(image => describeImage(image, 'screenshot_huge'))
    const artworks = (game.artworks ?? []).map(image => describeImage(image, 'screenshot_huge'))
    const imageIssues = [
        ...(cover?.issue ? ['cover: ' + cover.issue] : []),
        ...screenshots.flatMap((s, i) => s.issue ? ['screenshots[' + i + ']: ' + s.issue] : []),
        ...artworks.flatMap((s, i) => s.issue ? ['artworks[' + i + ']: ' + s.issue] : []),
    ]
    const companies = game.involved_companies ?? []
    const esrb = [...new Set((game.age_ratings ?? [])
        .filter(r => r.organization.name.toUpperCase() === 'ESRB')
        .flatMap(r => r.rating_category ? [r.rating_category.rating] : []))].sort()
    const released = game.first_release_date == null ? null : new Date(game.first_release_date * 1000).toISOString().slice(0, 10)
    const missing = [
        ...(!game.slug ? ['slug'] : []), ...(!game.summary ? ['summary'] : []),
        ...(!released ? ['released'] : []), ...(!cover?.displayUrl ? ['cover'] : []),
        ...(!game.genres?.length ? ['genres'] : []), ...(!game.platforms?.length ? ['platforms'] : []),
        ...(!companies.some(c => c.developer && c.company) ? ['developer'] : []),
        ...(!companies.some(c => c.publisher && c.company) ? ['publisher'] : []),
        ...(!esrb.length ? ['esrb'] : []), ...(!game.screenshots?.length ? ['screenshots'] : []),
    ]
    return {
        igdbId: game.id, name: game.name, slug: game.slug ?? null, gameType: game.game_type ?? null,
        released, esrb, esrbConflict: esrb.length > 1, missing,
        genres: game.genres?.map(g => g.name) ?? [], platforms: game.platforms?.map(p => p.name) ?? [],
        developers: [...new Set(companies.filter(c => c.developer).flatMap(c => c.company ? [c.company.name] : []))],
        publishers: [...new Set(companies.filter(c => c.publisher).flatMap(c => c.company ? [c.company.name] : []))],
        coverUrl: cover?.displayUrl ?? null, coverSourceUrl: cover?.sourceUrl ?? null,
        imageIssues, screenshots, artworks,
        screenshotCount: game.screenshots?.length ?? 0,
        landscapeArtworkCount: game.artworks?.filter(a => a.width && a.height && a.width > a.height).length ?? 0,
    }
}

type AuditRow = {
    appid: number; status: 'matched' | 'ambiguous' | 'unmatched' | 'error'; candidates: number[]
    error?: string; metadata?: ReturnType<typeof describe>[]; metadataError?: string
}
const safeError = (error: unknown) => error instanceof AuditError ? error.message : 'Audit operation failed.'
const externalSchema = z.array(z.object({
    id: positiveId, uid: z.string(), game: positiveId, external_game_source: positiveId,
}))

export async function auditSteam(client: IgdbAuditClient, input: SteamInput[]) {
    const started = Date.now()
    const games = parseSteamInput(input)
    const results: AuditRow[] = []
    // Verify the currently documented/source-observed Steam ID, rather than
    // confuse old category enums with the new source relationship.
    const sources = await client.query('external_game_sources', 'fields id,name; where id = 1; limit 1;',
        z.array(z.object({ id: positiveId, name: z.string() })))
    if (sources.length !== 1 || sources[0].id !== 1 || sources[0].name.toLowerCase() !== 'steam')
        throw new AuditError('Could not verify external_game_source 1 as Steam.')
    const mappingStarted = Date.now()
    for (let i = 0; i < games.length; i += 100) {
        const chunk = games.slice(i, i + 100)
        const ids = chunk.map(g => JSON.stringify(String(g.appid))).join(',')
        const matches = new Map(chunk.map(g => [String(g.appid), new Set<number>()]))
        try {
            let offset = 0
            while (true) {
                const rows = await client.query('external_games',
                    'fields id,uid,game,external_game_source; where external_game_source = 1 & uid = (' + ids + '); sort id asc; limit 500; offset ' + offset + ';',
                    externalSchema)
                for (const row of rows) {
                    if (row.external_game_source !== 1 || !matches.has(row.uid))
                        throw new AuditError('external_games returned an unexpected source or Steam ID.')
                    matches.get(row.uid)!.add(row.game)
                }
                if (rows.length < 500) break
                offset += 500
                if (offset >= 50_000) throw new AuditError('External mapping pagination exceeded the audit safety limit.')
            }
            for (const g of chunk) {
                const candidates = [...matches.get(String(g.appid))!].sort((a, b) => a - b)
                results.push({ appid: g.appid, candidates, status: candidates.length === 1 ? 'matched' : candidates.length ? 'ambiguous' : 'unmatched' })
            }
        } catch (error) {
            // A partially fetched page set is not reliable evidence of absence.
            results.push(...chunk.map(g => ({ appid: g.appid, candidates: [], status: 'error' as const, error: safeError(error) })))
        }
    }
    const mappingMs = Date.now() - mappingStarted
    const hydrationStarted = Date.now()
    const ids = [...new Set(results.flatMap(r => r.candidates))]
    const hydrated = new Map<number, ReturnType<typeof describe>>()
    const errors = new Map<number, string>()
    for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50)
        try {
            const rows = await client.query('games', 'fields ' + FIELDS + '; where id = (' + batch.join(',') + '); limit 50;', z.array(gameSchema))
            for (const row of rows) {
                if (!batch.includes(row.id)) throw new AuditError('games returned an unexpected game ID.')
                hydrated.set(row.id, describe(row))
            }
            for (const id of batch) if (!hydrated.has(id)) errors.set(id, 'Mapped IGDB game was absent from the metadata response.')
        } catch (error) { for (const id of batch) { hydrated.delete(id); errors.set(id, safeError(error)) } }
    }
    for (const row of results) {
        row.metadata = row.candidates.flatMap(id => hydrated.has(id) ? [hydrated.get(id)!] : [])
        const failed = row.candidates.filter(id => errors.has(id))
        if (failed.length) row.metadataError = 'Metadata unavailable for IGDB IDs: ' + failed.join(',') + '. ' + errors.get(failed[0])
    }
    const exactMatches = results.filter(r => r.status === 'matched').length
    const mappingErrors = results.filter(r => r.status === 'error').length
    const shared = new Map<number, number[]>()
    for (const row of results.filter(r => r.status === 'matched'))
        shared.set(row.candidates[0], [...(shared.get(row.candidates[0]) ?? []), row.appid])
    return {
        mode: 'steam' as const, generatedAt: new Date().toISOString(),
        summary: {
            total: games.length, exactMatches,
            ambiguous: results.filter(r => r.status === 'ambiguous').length,
            unmatched: results.filter(r => r.status === 'unmatched').length, errors: mappingErrors,
            // Null, not a misleading percentage, if mapping coverage is incomplete.
            coveragePercent: mappingErrors || !games.length ? null : Math.round(exactMatches / games.length * 10000) / 100,
            metadataErrors: results.filter(r => r.metadataError).length,
        },
        timing: { mappingMs, hydrationMs: Date.now() - hydrationStarted, totalMs: Date.now() - started },
        requests: client.stats, results,
        sharedGames: [...shared].filter(([, appids]) => appids.length > 1).map(([igdbId, appids]) => ({ igdbId, appids })),
    }
}

export async function auditMainGames(client: IgdbAuditClient, limit: number) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new AuditError('--main-games must be between 1 and 100.')
    const started = Date.now()
    const rows = await client.query('games',
        'fields ' + FIELDS + '; where game_type = 0; sort id asc; limit ' + limit + ';', z.array(gameSchema))
    if (rows.some(g => g.game_type !== 0)) throw new AuditError('Main-game sample returned a non-main game.')
    return {
        mode: 'main-games' as const, generatedAt: new Date().toISOString(), requested: limit,
        totalMs: Date.now() - started, requests: client.stats, games: rows.map(describe),
    }
}
