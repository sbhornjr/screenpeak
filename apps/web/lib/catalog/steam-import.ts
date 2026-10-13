import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { SteamImportBatch, SteamImportCursor, SteamLibrarySnapshot, SteamLinkEntry, SteamOwnedGames } from '@screenpeak/shared/types'
import { games, gameExternalIds, steamMatchCache } from '@/db/schema'
import { db, pg } from '@/lib/db'
import { igdbProvider } from '@/lib/igdb/provider'
import { logger } from '@/lib/logger'
import { getDeveloperNameMap } from '@/lib/queries/game'
import { dedupeSteamLinkEntries, getLibraryRowsForGames, LibraryReadError, upsertLibraryEntries } from '@/lib/queries/library'
import { getSteamAccount } from '@/lib/queries/steam'
import { getFullyCompletedAppids, getOwnedGames } from '@/lib/steam'
import { writeSteamMatchCache } from './match-cache'
import { writeCatalogBatch } from './batch-write'
import {
    STEAM_IMPORT_HEARTBEAT_MS,
    STEAM_IMPORT_LEASE_RETRY_MS,
    acquireSteamImportLease,
    heartbeatSteamImportLease,
    prepareSteamImportLock,
    releaseSteamImportLease,
    steamLeaseMissing,
} from './steam-import-lease'
import { detachSharedSteamAppIds, omitForeignSteamIds, omitForeignSteamIdsBatch } from './steam-ids'
import type { CatalogGame } from './types'
import { writeCatalogGame } from './upsert'

/** Bump when the matcher rules change so old negative-cache rows are ignored. */
export const STEAM_MATCHER_VERSION = 'igdb-steam-v1'
export const STEAM_MISS_CACHE_MS = 7 * 24 * 60 * 60 * 1000
/** IGDB external_games lookup page. The provider also paginates inside this size. */
export const STEAM_LOOKUP_BATCH = 100
/** One server-action round trip. The next call resumes from mappings and cache. */
export const STEAM_IMPORT_BATCH = 50
/** One signed-in library may start at most one IGDB batch per second, and only one at a time. */
export const STEAM_IMPORT_TURN_GAP_MS = 1000
const MAX_STEAM_APP_ID = 2_147_483_647

/**
 * Steam apps that must not become full-game ownership. 247750 is The Stanley
 * Parable Demo; IGDB links it to 3035, the full game. game_type is not used:
 * editions and expansions stay importable.
 */
export const KNOWN_INELIGIBLE_STEAM_APPS = [{ appid: 247750, igdbId: 3035, kind: 'demo' as const }]
const KNOWN_INELIGIBLE = new Map(KNOWN_INELIGIBLE_STEAM_APPS.map(row => [row.appid, row.kind]))

export class SteamImportInputError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'SteamImportInputError'
    }
}

export type OwnedSteamApp = { appid: number; name: string; playtimeMinutes: number }
export type SteamMatch = { appid: number; gameId: string }
export type ResolveSteamBatchResult = {
    matched: SteamMatch[]
    unmatched: number[]
    ambiguous: number[]
    retryable: number[]
}
export type SteamImportPreview = {
    entries: SteamLinkEntry[]
    totalApps: number
    pending: number
    unmatched: number
    ambiguous: number
    matchedGameCount: number
}
type SaveResult = {
    id: string | null
    attached: number[]
    rejected: number[]
    /** App ids that lost a unique-constraint race. Not negative-cached. */
    conflicted: number[]
    /** Those same ids when they are already stored on a catalogue game. */
    elsewhere: SteamMatch[]
}
export type SteamCatalogueProvider = {
    lookupSteamApps(appIds: number[]): Promise<{ appid: number; candidates: number[] }[]>
    getGamesByIds(ids: number[]): Promise<CatalogGame[]>
}
export type SteamImportStore = {
    mappings(appIds: number[]): Promise<SteamMatch[]>
    freshCache(appIds: number[], now: Date): Promise<{ appid: number; status: 'unmatched' | 'ambiguous' }[]>
    remember(appId: number, httpStatus: number, candidateCount: number, now: Date): Promise<boolean>
    saveGame(game: CatalogGame, ownedAppIds: number[]): Promise<SaveResult>
    /** One catalogue transaction for every new game in the lookup chunk. */
    saveGames?(items: { game: CatalogGame; ownedAppIds: number[] }[]): Promise<SaveResult[]>
}

export function steamOwnershipBlock(app: { appid: number; name: string }): 'demo' | 'software' | 'launcher' | null {
    const known = KNOWN_INELIGIBLE.get(app.appid)
    if (known) return known
    const name = app.name.normalize('NFKC').trim()
    if (/\bdemos?\b/i.test(name) || /\bplaytest\b/i.test(name)) return 'demo'
    if (/\blaunchers?\b/i.test(name)) return 'launcher'
    // "Software Inc", benchmarks, and SDK titles are real games. Only the dedicated-server tool is blocked by name.
    if (/\bdedicated servers?\b/i.test(name)) return 'software'
    return null
}

export function cacheUntil(checkedAt: Date): Date {
    return new Date(checkedAt.getTime() + STEAM_MISS_CACHE_MS)
}

export function hoursFromSteamMinutes(minutes: number): number {
    if (!Number.isFinite(minutes) || minutes <= 0) return 0
    return Math.floor(minutes / 60)
}

export function dedupeOwnedApps<T extends { appid: number }>(apps: T[]): T[] {
    const seen = new Set<number>()
    const result: T[] = []
    for (const app of apps) {
        if (!Number.isSafeInteger(app.appid) || app.appid <= 0 || app.appid > MAX_STEAM_APP_ID || seen.has(app.appid)) continue
        seen.add(app.appid)
        result.push(app)
    }
    return result
}

export { dedupeSteamLinkEntries }

export type SteamImportRequest = { retry: boolean; cursor: SteamImportCursor | null }

function parseCursor(value: unknown): SteamImportCursor | null {
    if (value == null) return null
    if (typeof value !== 'object' || Array.isArray(value)) throw new SteamImportInputError('Invalid import request.')
    const cursor = value as Record<string, unknown>
    const afterAppId = cursor.afterAppId
    if ((cursor.phase !== 'pending' && cursor.phase !== 'miss') || typeof afterAppId !== 'number' || !Number.isSafeInteger(afterAppId) || afterAppId < 0 || afterAppId > MAX_STEAM_APP_ID) {
        throw new SteamImportInputError('Invalid import request.')
    }
    return { phase: cursor.phase, afterAppId }
}

/** Ignores caller-supplied user ids and app ids. Retry may carry a resume cursor. */
export function parseSteamImportRequest(input: unknown): SteamImportRequest {
    if (input == null) return { retry: false, cursor: null }
    if (typeof input !== 'object' || Array.isArray(input)) throw new SteamImportInputError('Invalid import request.')
    const record = input as Record<string, unknown>
    if ('retry' in record && typeof record.retry !== 'boolean') throw new SteamImportInputError('Invalid import request.')
    return { retry: record.retry === true, cursor: parseCursor(record.cursor) }
}

/**
 * Pending apps first, then each cached miss at most once per retry click.
 * A later batch resumes after `nextCursor` instead of sorting the same misses to the front.
 */
export function selectSteamImportQueue(input: {
    retry: boolean
    cursor?: SteamImportCursor | null
    pendingAppIds: number[]
    cachedUnmatchedAppIds: number[]
    limit?: number
}): { appIds: number[]; nextCursor: SteamImportCursor | null } {
    const limit = input.limit ?? STEAM_IMPORT_BATCH
    const pending = [...new Set(input.pendingAppIds)].filter(id => id > 0).sort((a, b) => a - b)
    const pendingIds = new Set(pending)
    const misses = [...new Set(input.cachedUnmatchedAppIds)].filter(id => id > 0 && !pendingIds.has(id)).sort((a, b) => a - b)
    const moreAfter = (ids: number[], last: number | undefined, phase: SteamImportCursor['phase']): SteamImportCursor | null => {
        if (last == null || !ids.some(id => id > last)) return null
        return { phase, afterAppId: last }
    }
    if (!input.retry) {
        const appIds = pending.slice(0, limit)
        return { appIds, nextCursor: moreAfter(pending, appIds.at(-1), 'pending') }
    }
    const phase = input.cursor?.phase ?? 'pending'
    const after = input.cursor?.afterAppId ?? 0
    if (phase === 'miss') {
        const rest = misses.filter(id => id > after)
        const appIds = rest.slice(0, limit)
        return { appIds, nextCursor: moreAfter(rest, appIds.at(-1), 'miss') }
    }
    const restPending = pending.filter(id => id > after)
    if (restPending.length >= limit) {
        const appIds = restPending.slice(0, limit)
        return { appIds, nextCursor: { phase: 'pending', afterAppId: appIds.at(-1)! } }
    }
    const fromMisses = misses.slice(0, limit - restPending.length)
    const appIds = [...restPending, ...fromMisses]
    return { appIds, nextCursor: moreAfter(misses, fromMisses.at(-1), 'miss') }
}

/** Keep a hand-edited hour total. Refresh when the stored hours are still the previous automatic Steam sum. */
export function hoursForSteamLibrary(saved: { hoursPlayed: number | null; steamPlaytimeMinutes: number | null } | undefined, minutes: number): number {
    const steamHours = hoursFromSteamMinutes(minutes)
    if (!saved || saved.hoursPlayed == null) return steamHours
    if (saved.steamPlaytimeMinutes == null) return saved.hoursPlayed
    if (saved.hoursPlayed === hoursFromSteamMinutes(saved.steamPlaytimeMinutes)) return steamHours
    return saved.hoursPlayed
}

export function buildSteamLinkEntries(input: {
    owned: { appid: number; playtimeMinutes: number }[]
    matches: SteamMatch[]
    cards: { id: string; name: string; coverImageUrl: string | null; released: string | null; developer: string }[]
    library: SteamLibrarySnapshot[]
    completedAppIds: Iterable<number>
}): SteamLinkEntry[] {
    const minutesByApp = new Map<number, number>()
    for (const app of dedupeOwnedApps(input.owned.map(row => ({ appid: row.appid, name: '' })))) {
        const minutes = input.owned.find(item => item.appid === app.appid)?.playtimeMinutes ?? 0
        minutesByApp.set(app.appid, Number.isFinite(minutes) && minutes > 0 ? minutes : 0)
    }
    const cards = new Map(input.cards.map(card => [card.id, card]))
    const library = new Map(input.library.map(row => [row.gameId, row]))
    const completed = new Set(input.completedAppIds)
    const appsByGame = new Map<string, number[]>()
    const seen = new Set<string>()
    for (const match of input.matches) {
        const key = `${match.gameId}:${match.appid}`
        if (seen.has(key)) continue
        seen.add(key)
        const list = appsByGame.get(match.gameId) ?? []
        list.push(match.appid)
        appsByGame.set(match.gameId, list)
    }
    const entries: SteamLinkEntry[] = []
    for (const [gameId, appIds] of appsByGame) {
        const card = cards.get(gameId)
        if (!card) continue
        const distinct = [...new Set(appIds)]
        const minutes = distinct.reduce((sum, appid) => sum + (minutesByApp.get(appid) ?? 0), 0)
        const saved = library.get(gameId)
        const steamCompleted = distinct.some(appid => completed.has(appid))
        entries.push({
            gameId,
            playtimeSelected: hoursForSteamLibrary(saved, minutes),
            status: saved?.status ?? (minutes > 0 ? 'playing' : 'backlog'),
            selected: true,
            coverImageUrl: card.coverImageUrl,
            gameName: card.name,
            gameDeveloper: card.developer,
            gameReleased: card.released,
            timesPlayed: saved ? (saved.playCount ?? 0) : (minutes > 0 ? 1 : 0),
            completedAllAchievements: Boolean(saved?.completedAllAchievements) || steamCompleted,
        })
    }
    entries.sort((a, b) => a.gameName.localeCompare(b.gameName) || a.gameId.localeCompare(b.gameId))
    return entries
}

function chunks<T>(values: T[], size: number): T[][] {
    const result: T[][] = []
    for (let offset = 0; offset < values.length; offset += size) result.push(values.slice(offset, offset + size))
    return result
}

function withoutBlockedSteamIds(game: CatalogGame, drop: Set<number>): CatalogGame {
    return { ...game, steamAppIds: game.steamAppIds.filter(id => !drop.has(id) && !KNOWN_INELIGIBLE.has(id)) }
}

async function readSteamMappings(appIds: number[]): Promise<SteamMatch[]> {
    const matches: SteamMatch[] = []
    for (const chunk of chunks(appIds, STEAM_LOOKUP_BATCH)) {
        if (!chunk.length) continue
        const rows = await db.select({ externalId: gameExternalIds.externalId, gameId: gameExternalIds.gameId })
            .from(gameExternalIds)
            .where(and(eq(gameExternalIds.provider, 'steam'), inArray(gameExternalIds.externalId, chunk.map(String))))
        for (const row of rows) {
            const appid = Number(row.externalId)
            if (Number.isSafeInteger(appid)) matches.push({ appid, gameId: row.gameId })
        }
    }
    return matches
}

export function createDbSteamImportStore(): SteamImportStore {
    return {
        mappings(appIds) {
            return readSteamMappings(appIds)
        },
        async freshCache(appIds, now) {
            const rows: { appid: number; status: 'unmatched' | 'ambiguous' }[] = []
            for (const chunk of chunks(appIds, STEAM_LOOKUP_BATCH)) {
                const found = await db.select({ appid: steamMatchCache.steamAppId, status: steamMatchCache.status })
                    .from(steamMatchCache)
                    .where(and(
                        eq(steamMatchCache.matcherVersion, STEAM_MATCHER_VERSION),
                        inArray(steamMatchCache.steamAppId, chunk),
                        sql`${steamMatchCache.retryAfter} > ${now.toISOString()}::timestamptz`,
                    ))
                for (const row of found) {
                    if (row.status === 'unmatched' || row.status === 'ambiguous') rows.push({ appid: row.appid, status: row.status })
                }
            }
            return rows
        },
        async remember(appId, httpStatus, candidateCount, now) {
            return writeSteamMatchCache(db, {
                steamAppId: appId,
                matcherVersion: STEAM_MATCHER_VERSION,
                httpStatus,
                candidateCount,
                checkedAt: now.toISOString(),
                retryAfter: cacheUntil(now).toISOString(),
            })
        },
        async saveGame(game, ownedAppIds) {
            const owned = [...new Set(ownedAppIds)]
            const attempt = (ids: number[]) => db.transaction(async tx => {
                await tx.execute(sql`set local lock_timeout = '5s'`)
                await tx.execute(sql`set local statement_timeout = '15s'`)
                const prepared = await omitForeignSteamIds(tx, { ...game, steamAppIds: ids })
                const keep = ids.filter(id => prepared.game.steamAppIds.includes(id))
                const omitted = ids.filter(id => !keep.includes(id))
                if (!keep.length) return { id: null as string | null, attached: [] as number[], omitted }
                // Additive: a filtered id list must not delete Steam rows already stored for this game.
                const saved = await writeCatalogGame(tx, { ...prepared.game, steamAppIds: keep }, { retainUnlistedSteamIds: true })
                const attached: number[] = []
                const rejected: number[] = [...omitted]
                const verifiedAt = new Date().toISOString()
                for (const appId of keep) {
                    const linked = await tx.select({ gameId: gameExternalIds.gameId }).from(gameExternalIds)
                        .where(and(eq(gameExternalIds.provider, 'steam'), eq(gameExternalIds.externalId, String(appId))))
                    if (linked[0]?.gameId === saved.id) { attached.push(appId); continue }
                    if (linked[0]) { rejected.push(appId); continue }
                    await tx.insert(gameExternalIds).values({
                        provider: 'steam', externalId: String(appId), gameId: saved.id,
                        matchMethod: 'igdb_external_id', verifiedAt,
                    }).onConflictDoNothing()
                    const again = await tx.select({ gameId: gameExternalIds.gameId }).from(gameExternalIds)
                        .where(and(eq(gameExternalIds.provider, 'steam'), eq(gameExternalIds.externalId, String(appId))))
                    if (again[0]?.gameId === saved.id) attached.push(appId)
                    else rejected.push(appId)
                }
                return { id: saved.id, attached, omitted: rejected }
            })
            const describe = async (outcome: { id: string | null; attached: number[]; omitted: number[] }, prior: SteamMatch[]) => {
                const elsewhere = [...prior, ...(outcome.omitted.length ? await readSteamMappings(outcome.omitted) : [])]
                const seen = new Set<number>()
                const unique = elsewhere.filter(row => {
                    if (outcome.attached.includes(row.appid) || seen.has(row.appid)) return false
                    seen.add(row.appid)
                    return true
                })
                const settled = new Set([...outcome.attached, ...unique.map(row => row.appid)])
                return {
                    id: outcome.id,
                    attached: outcome.attached,
                    rejected: outcome.omitted.filter(id => !settled.has(id)),
                    conflicted: [] as number[],
                    elsewhere: unique,
                }
            }
            try {
                return await describe(await attempt(owned), [])
            } catch (error) {
                // The loser of a unique constraint rolls back. Retry without the ids that landed elsewhere.
                // Do not cache the whole owned set as ambiguous for seven days.
                if (!(error instanceof Error) || !error.message.includes('already associated')) throw error
                const current = await readSteamMappings(owned)
                const taken = new Set(current.map(row => row.appid))
                const retryIds = owned.filter(id => !taken.has(id))
                if (!retryIds.length) return { id: null, attached: [], rejected: [], conflicted: [], elsewhere: current }
                try {
                    return await describe(await attempt(retryIds), current)
                } catch (again) {
                    if (!(again instanceof Error) || !again.message.includes('already associated')) throw again
                    const after = await readSteamMappings(owned)
                    const settled = new Set(after.map(row => row.appid))
                    return { id: null, attached: [], rejected: [], conflicted: owned.filter(id => !settled.has(id)), elsewhere: after }
                }
            }
        },
        async saveGames(items) {
            if (!items.length) return []
            const keptIds = items.map(item => [...new Set(item.ownedAppIds)])
            await db.transaction(async tx => {
                await tx.execute(sql`set local lock_timeout = '5s'`)
                await tx.execute(sql`set local statement_timeout = '30s'`)
                const filtered = await omitForeignSteamIdsBatch(tx, items.map((item, index) => ({ ...item.game, steamAppIds: keptIds[index] })))
                for (let index = 0; index < items.length; index += 1) keptIds[index] = filtered.games[index]?.steamAppIds ?? []
                const writable = filtered.games.filter(game => game.steamAppIds.length).map(game => ({ ...game, steamAppIds: [] as number[] }))
                if (writable.length) await writeCatalogBatch(tx, writable, { retainUnlistedSteamIds: true })
                const pairs = filtered.games.flatMap(game => game.steamAppIds.map(appId => sql`(${game.igdbId}::int, ${String(appId)})`))
                if (pairs.length) {
                    const now = new Date().toISOString()
                    await tx.execute(sql`insert into public.game_external_ids (provider, external_id, game_id, match_method, verified_at)
                        select 'steam', pair.external_id, catalogue.id, 'igdb_external_id', ${now}::timestamptz
                        from (values ${sql.join(pairs, sql`, `)}) as pair(igdb_id, external_id)
                        join public.games catalogue on catalogue.igdb_id = pair.igdb_id
                        on conflict (provider, external_id) do update set verified_at = excluded.verified_at
                        where public.game_external_ids.game_id = excluded.game_id`)
                }
            })
            const wanted = [...new Set(items.flatMap(item => item.ownedAppIds))]
            const mappings = await readSteamMappings(wanted)
            const ownerOf = new Map(mappings.map(row => [row.appid, row]))
            const storedIds = new Map<number, string>()
            if (items.length) {
                const rows = await db.execute(sql`select id::text as id, igdb_id as "igdbId" from public.games
                    where igdb_id in (${sql.join(items.map(item => sql`${item.game.igdbId}`), sql`, `)})`) as { id: string; igdbId: number }[]
                for (const row of rows) storedIds.set(Number(row.igdbId), row.id)
            }
            return items.map((item, index) => {
                const gameId = storedIds.get(item.game.igdbId) ?? null
                const kept = new Set(keptIds[index])
                const attached: number[] = []
                const elsewhere: SteamMatch[] = []
                const rejected: number[] = []
                for (const appid of [...new Set(item.ownedAppIds)]) {
                    const owner = ownerOf.get(appid)
                    if (kept.has(appid) && owner?.gameId === gameId && gameId) attached.push(appid)
                    else if (owner) elsewhere.push(owner)
                    else rejected.push(appid)
                }
                const settled = new Set([...attached, ...elsewhere.map(row => row.appid)])
                return {
                    id: attached.length ? gameId : null,
                    attached,
                    rejected: rejected.filter(appid => !settled.has(appid)),
                    conflicted: [] as number[],
                    elsewhere,
                }
            })
        },
    }
}

type Inspected = {
    matches: SteamMatch[]
    pendingAppIds: number[]
    unmatchedAppIds: number[]
    ambiguousAppIds: number[]
    cachedUnmatchedAppIds: number[]
}

async function inspectOwned(owned: OwnedSteamApp[], store: SteamImportStore, now: Date): Promise<Inspected> {
    const unmatched: number[] = []
    const eligible: OwnedSteamApp[] = []
    for (const app of dedupeOwnedApps(owned)) {
        if (steamOwnershipBlock(app)) unmatched.push(app.appid)
        else eligible.push(app)
    }
    const mapped = await store.mappings(eligible.map(app => app.appid))
    const blocked = new Set(unmatched)
    const matches = mapped.filter(match => !blocked.has(match.appid))
    const mappedIds = new Set(matches.map(match => match.appid))
    const unmapped = eligible.map(app => app.appid).filter(appid => !mappedIds.has(appid))
    const cached = unmapped.length ? await store.freshCache(unmapped, now) : []
    const cachedUnmatched = cached.filter(row => row.status === 'unmatched').map(row => row.appid)
    const cachedAmbiguous = cached.filter(row => row.status === 'ambiguous').map(row => row.appid)
    const cachedIds = new Set([...cachedUnmatched, ...cachedAmbiguous])
    return {
        matches,
        pendingAppIds: unmapped.filter(appid => !cachedIds.has(appid)),
        unmatchedAppIds: [...unmatched, ...cachedUnmatched],
        ambiguousAppIds: cachedAmbiguous,
        cachedUnmatchedAppIds: cachedUnmatched,
    }
}

function pushUnique(target: number[], values: number[]) {
    const seen = new Set(target)
    for (const value of values) if (!seen.has(value)) { seen.add(value); target.push(value) }
}

/**
 * Match Steam apps to catalogue games. Stored mappings win. IGDB is queried
 * only for the rest, through the shared provider (and its rate-limit budget).
 * A thrown provider or database error stays retryable or propagates; it is
 * never recorded as "no match".
 */
export async function resolveSteamBatch(
    input: { appid: number; name: string }[],
    options: { retry?: boolean; now?: Date; provider?: SteamCatalogueProvider; store?: SteamImportStore } = {},
): Promise<ResolveSteamBatchResult> {
    const now = options.now ?? new Date()
    const store = options.store ?? createDbSteamImportStore()
    const provider = options.provider ?? igdbProvider
    const owned = dedupeOwnedApps(input)
    const matched: SteamMatch[] = []
    const unmatched: number[] = []
    const ambiguous: number[] = []
    const retryable: number[] = []
    const eligible: { appid: number; name: string }[] = []
    for (const app of owned) {
        if (steamOwnershipBlock(app)) unmatched.push(app.appid)
        else eligible.push(app)
    }
    const known = await store.mappings(eligible.map(app => app.appid))
    const knownIds = new Set(known.map(match => match.appid))
    matched.push(...known)
    let pending = eligible.filter(app => !knownIds.has(app.appid))
    if (pending.length) {
        const cached = await store.freshCache(pending.map(app => app.appid), now)
        const skip = new Set<number>()
        for (const row of cached) {
            // Explicit retry bypasses a cached miss only. Ambiguous rows and the rate limit stay in force.
            if (row.status === 'unmatched' && options.retry) continue
            skip.add(row.appid)
            if (row.status === 'ambiguous') ambiguous.push(row.appid)
            else unmatched.push(row.appid)
        }
        pending = pending.filter(app => !skip.has(app.appid))
    }
    for (const chunk of chunks(pending.map(app => app.appid), STEAM_LOOKUP_BATCH)) {
        let lookedUp: { appid: number; candidates: number[] }[]
        try {
            lookedUp = await provider.lookupSteamApps(chunk)
        } catch (error) {
            logger.warn('catalog:steam-import', 'Steam lookup failed', { error: error instanceof Error ? error.message : String(error) })
            pushUnique(retryable, chunk)
            continue
        }
        const byApp = new Map(lookedUp.map(row => [row.appid, row.candidates]))
        const unique = new Map<number, number>()
        for (const appid of chunk) {
            if (!byApp.has(appid)) { retryable.push(appid); continue }
            const candidates = [...new Set(byApp.get(appid) ?? [])]
            if (candidates.length === 0) {
                unmatched.push(appid)
                await store.remember(appid, 200, 0, now)
            } else if (candidates.length > 1) {
                ambiguous.push(appid)
                await store.remember(appid, 200, candidates.length, now)
            } else unique.set(appid, candidates[0])
        }
        if (!unique.size) continue
        let hydrated: CatalogGame[]
        try {
            hydrated = await provider.getGamesByIds([...new Set(unique.values())])
        } catch (error) {
            logger.warn('catalog:steam-import', 'Steam metadata failed', { error: error instanceof Error ? error.message : String(error) })
            pushUnique(retryable, [...unique.keys()])
            continue
        }
        const drop = new Set<number>([...ambiguous, ...unmatched, ...KNOWN_INELIGIBLE.keys()])
        const prepared = detachSharedSteamAppIds(hydrated.map(game => withoutBlockedSteamIds(game, drop)))
        const sharedIds = new Set(prepared.shared.map(row => row.appId))
        for (const appid of unique.keys()) {
            if (!sharedIds.has(appid)) continue
            ambiguous.push(appid)
            unique.delete(appid)
            await store.remember(appid, 200, 2, now)
        }
        const gamesByIgdb = new Map(prepared.games.map(game => [game.igdbId, game]))
        const ownedByIgdb = new Map<number, number[]>()
        for (const [appid, igdbId] of unique) {
            const list = ownedByIgdb.get(igdbId) ?? []
            list.push(appid)
            ownedByIgdb.set(igdbId, list)
        }
        const saves: { game: CatalogGame; ownedAppIds: number[] }[] = []
        for (const [igdbId, appIds] of ownedByIgdb) {
            const game = gamesByIgdb.get(igdbId)
            if (!game) { pushUnique(retryable, appIds); continue }
            const present = appIds.filter(appid => game.steamAppIds.includes(appid))
            const absent = appIds.filter(appid => !game.steamAppIds.includes(appid))
            pushUnique(retryable, absent)
            if (!present.length) continue
            // Only the owned apps we accepted. Other IGDB steam ids (including an unnamed demo) are not stored.
            saves.push({ game: { ...game, steamAppIds: present }, ownedAppIds: present })
        }
        const recordSave = (saved: SaveResult) => {
            if (saved.id) for (const appid of saved.attached) matched.push({ appid, gameId: saved.id })
            for (const row of saved.elsewhere) {
                if (!matched.some(match => match.appid === row.appid)) matched.push(row)
            }
            const settled = new Set(matched.map(match => match.appid))
            pushUnique(retryable, [...saved.rejected, ...saved.conflicted].filter(appid => !settled.has(appid)))
        }
        if (saves.length && store.saveGames) {
            try {
                logger.info('catalog:steam-import', 'Writing matched games', { games: saves.length })
                for (const saved of await store.saveGames(saves)) recordSave(saved)
            } catch (error) {
                logger.error('catalog:steam-import', 'Steam catalogue write failed', { error: error instanceof Error ? error.message : String(error) })
                pushUnique(retryable, saves.flatMap(item => item.ownedAppIds))
            }
        } else {
            for (const item of saves) {
                try {
                    recordSave(await store.saveGame(item.game, item.ownedAppIds))
                } catch (error) {
                    // One game's failure must not abort the rest of the import, and must not be cached as a miss.
                    logger.error('catalog:steam-import', 'Steam catalogue write failed', { error: error instanceof Error ? error.message : String(error) })
                    pushUnique(retryable, item.ownedAppIds)
                }
            }
        }
    }
    logger.info('catalog:steam-import', 'Resolved Steam batch', {
        matched: matched.length, unmatched: unmatched.length, ambiguous: ambiguous.length, retryable: retryable.length,
    })
    matched.sort((a, b) => a.appid - b.appid)
    unmatched.sort((a, b) => a - b)
    ambiguous.sort((a, b) => a - b)
    retryable.sort((a, b) => a - b)
    return { matched, unmatched, ambiguous, retryable }
}

function librarySnapshots(rows: Awaited<ReturnType<typeof getLibraryRowsForGames>>): SteamLibrarySnapshot[] {
    return rows.map(entry => ({
        gameId: entry.game_id,
        hoursPlayed: entry.hours_played == null ? null : Number(entry.hours_played),
        status: entry.status,
        playCount: entry.play_count,
        completedAllAchievements: entry.completed_all_achievements,
        steamPlaytimeMinutes: entry.steam_playtime_minutes,
    }))
}

async function loadEntries(userId: string, owned: OwnedSteamApp[], matches: SteamMatch[], completedAppIds: Iterable<number>): Promise<SteamLinkEntry[]> {
    const gameIds = [...new Set(matches.map(match => match.gameId))]
    if (!gameIds.length) return []
    const rows: { id: string; name: string; coverImageUrl: string | null; released: string | null }[] = []
    for (const chunk of chunks(gameIds, 200)) {
        rows.push(...await db.select({
            id: games.id, name: games.name, coverImageUrl: games.coverImageUrl, released: games.released,
        }).from(games).where(inArray(games.id, chunk)))
    }
    const developers = await getDeveloperNameMap(gameIds)
    const library = await getLibraryRowsForGames(userId, gameIds)
    return buildSteamLinkEntries({
        owned,
        matches,
        cards: rows.map(row => ({
            id: row.id,
            name: row.name,
            coverImageUrl: row.coverImageUrl,
            released: row.released ? String(row.released).slice(0, 10) : null,
            developer: developers.get(String(row.id)) ?? '',
        })),
        library: librarySnapshots(library),
        completedAppIds,
    })
}

export async function loadSteamImportPreview(userId: string, owned: OwnedSteamApp[]): Promise<SteamImportPreview> {
    const now = new Date()
    const store = createDbSteamImportStore()
    const inspected = await inspectOwned(owned, store, now)
    // Achievement checks for newly matched apps happen inside the batch action.
    // First paint must not call Steam once per already-mapped app.
    const entries = await loadEntries(userId, owned, inspected.matches, [])
    return {
        entries,
        totalApps: dedupeOwnedApps(owned).length,
        pending: inspected.pendingAppIds.length,
        unmatched: inspected.unmatchedAppIds.length,
        ambiguous: inspected.ambiguousAppIds.length,
        matchedGameCount: entries.length,
    }
}

async function steamIdFor(userId: string): Promise<string> {
    const account = await getSteamAccount(userId)
    if (!account?.steam_id) throw new SteamImportInputError('Link Steam before importing.')
    return account.steam_id
}

const busyBatch = (cursor: SteamImportCursor | null): SteamImportBatch => ({
    entries: [],
    remaining: 1,
    totalApps: 0,
    matchedGameCount: 0,
    unmatchedAppCount: 0,
    ambiguousAppCount: 0,
    retryableAppCount: 1,
    nextCursor: cursor,
    notice: 'Matching is already running for your library.',
    retryAfterMs: STEAM_IMPORT_LEASE_RETRY_MS,
})

/**
 * One library at a time, and at most one IGDB batch per second. The lease row
 * expires when its heartbeat stops, so a dead request cannot block the retry
 * button. A leftover session lock from the previous importer is cleared once
 * it has been idle for the same TTL. The gap keeps a fast retry loop off the
 * shared budget.
 */
export async function withSteamImportTurn<T>(userId: string, run: () => Promise<T>): Promise<T | { busy: true }> {
    if (await prepareSteamImportLock(pg, userId) === 'busy') return { busy: true }
    const token = randomUUID()
    let held = false
    try {
        held = await acquireSteamImportLease(pg, userId, token)
    } catch (error) {
        if (steamLeaseMissing(error)) throw new SteamImportInputError('Steam import lease is not installed. Apply 0008_steam_import_lease, then try the remaining matches again.')
        throw error
    }
    if (!held) return { busy: true }
    const timer = setInterval(() => {
        heartbeatSteamImportLease(pg, userId, token).catch(error => {
            logger.warn('catalog:steam-import', 'Steam import heartbeat failed', { error: error instanceof Error ? error.message : String(error) })
        })
    }, STEAM_IMPORT_HEARTBEAT_MS)
    try {
        const key = createHash('sha256').update(`steam-import:${userId}`).digest('hex')
        await pg.unsafe(`insert into igdb_private.request_budgets (credential_key) values ($1) on conflict (credential_key) do nothing`, [key])
        const [pace] = await pg.unsafe(`select case when next_start_at = '-infinity'::timestamptz then 0
                else greatest(0, floor(extract(epoch from (next_start_at - clock_timestamp())) * 1000))::int
            end as wait_ms
            from igdb_private.request_budgets where credential_key = $1`, [key]) as { wait_ms: number }[]
        const waitMs = Math.min(STEAM_IMPORT_TURN_GAP_MS, Math.max(0, Number(pace?.wait_ms ?? 0)))
        if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs))
        await pg.unsafe(`update igdb_private.request_budgets
            set next_start_at = clock_timestamp() + (${STEAM_IMPORT_TURN_GAP_MS} * interval '1 millisecond')
            where credential_key = $1`, [key])
        return await run()
    } finally {
        clearInterval(timer)
        if (held) {
            try { await releaseSteamImportLease(pg, userId, token) }
            catch (error) {
                logger.warn('catalog:steam-import', 'Steam import lease release failed', { error: error instanceof Error ? error.message : String(error) })
            }
        }
    }
}

async function runSteamImportBatchUnlocked(userId: string, request: SteamImportRequest, steamId: string, owned: OwnedSteamApp[]): Promise<SteamImportBatch | { error: string }> {
    const now = new Date()
    const store = createDbSteamImportStore()
    const before = await inspectOwned(owned, store, now)
    const beforeApps = new Set(before.matches.map(match => match.appid))
    const selected = selectSteamImportQueue({
        retry: request.retry,
        cursor: request.retry ? request.cursor : null,
        pendingAppIds: before.pendingAppIds,
        cachedUnmatchedAppIds: before.cachedUnmatchedAppIds,
    })
    let resolved: ResolveSteamBatchResult = { matched: [], unmatched: [], ambiguous: [], retryable: [] }
    if (selected.appIds.length) {
        const nameById = new Map(owned.map(app => [app.appid, app.name]))
        try {
            resolved = await resolveSteamBatch(selected.appIds.map(appid => ({ appid, name: nameById.get(appid) ?? '' })), { retry: request.retry, now, store })
        } catch (error) {
            logger.error('catalog:steam-import', 'Steam batch failed', { error: error instanceof Error ? error.message : String(error) })
            return { error: 'Matching is unavailable. Your matched games are still listed.' }
        }
    }
    const after = await inspectOwned(owned, store, now)
    const newAppIds = after.matches.map(match => match.appid).filter(appid => !beforeApps.has(appid))
    const completed = newAppIds.length ? await getFullyCompletedAppids(steamId, newAppIds) : new Set<number>()
    let entries: SteamLinkEntry[]
    try { entries = await loadEntries(userId, owned, after.matches, completed) }
    catch (error) {
        if (error instanceof LibraryReadError) return { error: error.message }
        throw error
    }
    const retryableIds = new Set(resolved.retryable)
    const pendingLeft = after.pendingAppIds.filter(appid => !retryableIds.has(appid))
    const nextCursor = resolved.retryable.length || !selected.appIds.length ? null : selected.nextCursor
    const stillQueued = nextCursor
        ? selectSteamImportQueue({
            retry: request.retry,
            cursor: nextCursor,
            pendingAppIds: pendingLeft,
            cachedUnmatchedAppIds: request.retry ? after.cachedUnmatchedAppIds : [],
            limit: Number.MAX_SAFE_INTEGER,
        }).appIds.length
        : 0
    return {
        entries,
        remaining: stillQueued + resolved.retryable.length,
        totalApps: owned.length,
        matchedGameCount: entries.length,
        unmatchedAppCount: after.unmatchedAppIds.length,
        ambiguousAppCount: after.ambiguousAppIds.length,
        retryableAppCount: resolved.retryable.length,
        nextCursor,
    }
}

export async function runSteamImportBatch(userId: string, request: SteamImportRequest): Promise<SteamImportBatch | { error: string }> {
    try {
        let steamId: string
        try { steamId = await steamIdFor(userId) }
        catch (error) {
            if (error instanceof SteamImportInputError) return { error: error.message }
            throw error
        }
        let ownedRaw: SteamOwnedGames
        try { ownedRaw = await getOwnedGames(steamId) }
        catch (error) {
            logger.warn('catalog:steam-import', 'Owned games lookup failed', { error: error instanceof Error ? error.message : String(error) })
            return { error: 'Steam is unavailable. Your matched games are still listed.' }
        }
        if (!ownedRaw.games) return { error: 'Steam library details are not public.' }
        const owned = dedupeOwnedApps(ownedRaw.games.map(game => ({
            appid: game.appid, name: game.name ?? '', playtimeMinutes: game.playtime_forever ?? 0,
        })))
        const turn = await withSteamImportTurn(userId, () => runSteamImportBatchUnlocked(userId, request, steamId, owned))
        if ('busy' in turn) return busyBatch(request.cursor)
        return turn
    } catch (error) {
        if (error instanceof SteamImportInputError) return { error: error.message }
        if (error instanceof LibraryReadError) return { error: error.message }
        logger.error('catalog:steam-import', 'Steam import turn failed', { error: error instanceof Error ? error.message : String(error) })
        return { error: 'Matching is unavailable. Your matched games are still listed.' }
    }
}

function pickConfirmed<T>(client: T, stored: T, automatic: T): T {
    if (client === stored || client === automatic) return stored
    return client
}

function confirmedHours(client: number, stored: SteamLibrarySnapshot | undefined, minutes: number): number {
    if (!stored || stored.hoursPlayed == null) return client
    const steamHours = hoursFromSteamMinutes(minutes)
    const refreshed = hoursForSteamLibrary(stored, minutes)
    if (client !== stored.hoursPlayed && client !== steamHours && client !== refreshed) return client
    return refreshed
}

/** Recompute Steam minutes and keep an existing library row when the client still shows the automatic values. */
export function mergeConfirmedSteamEntry(client: SteamLinkEntry, stored: SteamLibrarySnapshot | undefined, minutes: number): SteamLinkEntry {
    const automaticStatus = minutes > 0 ? 'playing' : 'backlog'
    const automaticTimes = minutes > 0 ? 1 : 0
    if (!stored) return { ...client, steamPlaytimeMinutes: minutes }
    return {
        ...client,
        playtimeSelected: confirmedHours(client.playtimeSelected, stored, minutes),
        status: pickConfirmed(client.status, stored.status, automaticStatus),
        timesPlayed: pickConfirmed(client.timesPlayed ?? automaticTimes, stored.playCount ?? automaticTimes, automaticTimes),
        completedAllAchievements: pickConfirmed(client.completedAllAchievements, Boolean(stored.completedAllAchievements), false),
        steamPlaytimeMinutes: minutes,
    }
}

export async function confirmSteamLibraryEntries(
    userId: string,
    entries: SteamLinkEntry[],
    owned: OwnedSteamApp[],
    deps: {
        store?: SteamImportStore
        write?: (userId: string, rows: SteamLinkEntry[]) => Promise<unknown>
        readLibrary?: (userId: string, gameIds: string[]) => Promise<SteamLibrarySnapshot[]>
    } = {},
): Promise<SteamLinkEntry[]> {
    const deduped = dedupeSteamLinkEntries(entries)
    if (!deduped.length) return []
    if (deduped.some(entry => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.gameId))) {
        throw new SteamImportInputError('Choose games from your Steam library and try again.')
    }
    const store = deps.store ?? createDbSteamImportStore()
    const write = deps.write ?? upsertLibraryEntries
    const readLibrary = deps.readLibrary ?? (async (id, gameIds) => librarySnapshots(await getLibraryRowsForGames(id, gameIds)))
    const eligible = dedupeOwnedApps(owned).filter(app => !steamOwnershipBlock(app))
    const matches = await store.mappings(eligible.map(app => app.appid))
    const allowed = new Set(matches.map(match => match.gameId))
    if (deduped.some(entry => !allowed.has(entry.gameId))) {
        throw new SteamImportInputError('Choose games from your Steam library and try again.')
    }
    const minutesByApp = new Map(eligible.map(app => [app.appid, app.playtimeMinutes]))
    const minutesByGame = new Map<string, number>()
    for (const match of matches) {
        minutesByGame.set(match.gameId, (minutesByGame.get(match.gameId) ?? 0) + (minutesByApp.get(match.appid) ?? 0))
    }
    let stored: SteamLibrarySnapshot[]
    try { stored = await readLibrary(userId, deduped.map(entry => entry.gameId)) }
    catch (error) {
        if (error instanceof LibraryReadError) throw new SteamImportInputError(error.message)
        throw error
    }
    const storedByGame = new Map(stored.map(row => [row.gameId, row]))
    const merged = deduped.map(entry => mergeConfirmedSteamEntry(entry, storedByGame.get(entry.gameId), minutesByGame.get(entry.gameId) ?? 0))
    await write(userId, merged)
    return merged
}

export async function importConfirmedSteamLibrary(userId: string, entries: SteamLinkEntry[]): Promise<void> {
    const steamId = await steamIdFor(userId)
    const ownedRaw = await getOwnedGames(steamId)
    if (!ownedRaw.games) throw new SteamImportInputError('Steam library details are not public.')
    const owned = dedupeOwnedApps(ownedRaw.games.map(game => ({
        appid: game.appid, name: game.name ?? '', playtimeMinutes: game.playtime_forever ?? 0,
    })))
    await confirmSteamLibraryEntries(userId, entries, owned)
}
