import 'server-only'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { SteamImportBatch, SteamLinkEntry, SteamOwnedGames } from '@screenpeak/shared/types'
import { games, gameExternalIds, steamMatchCache } from '@/db/schema'
import { db } from '@/lib/db'
import { igdbProvider } from '@/lib/igdb/provider'
import { logger } from '@/lib/logger'
import { getDeveloperNameMap } from '@/lib/queries/game'
import { dedupeSteamLinkEntries, getLibraryEntries, upsertLibraryEntries } from '@/lib/queries/library'
import { getSteamAccount } from '@/lib/queries/steam'
import { getFullyCompletedAppids, getOwnedGames } from '@/lib/steam'
import { writeSteamMatchCache } from './match-cache'
import { detachSharedSteamAppIds, omitForeignSteamIds } from './steam-ids'
import type { CatalogGame } from './types'
import { writeCatalogGame } from './upsert'

/** Bump when the matcher rules change so old negative-cache rows are ignored. */
export const STEAM_MATCHER_VERSION = 'igdb-steam-v1'
export const STEAM_MISS_CACHE_MS = 7 * 24 * 60 * 60 * 1000
/** IGDB external_games lookup page. The provider also paginates inside this size. */
export const STEAM_LOOKUP_BATCH = 100
/** One server-action round trip. The next call resumes from mappings and cache. */
export const STEAM_IMPORT_BATCH = 50
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
type SaveResult = { id: string | null; attached: number[]; rejected: number[] }
export type SteamCatalogueProvider = {
    lookupSteamApps(appIds: number[]): Promise<{ appid: number; candidates: number[] }[]>
    getGamesByIds(ids: number[]): Promise<CatalogGame[]>
}
export type SteamImportStore = {
    mappings(appIds: number[]): Promise<SteamMatch[]>
    freshCache(appIds: number[], now: Date): Promise<{ appid: number; status: 'unmatched' | 'ambiguous' }[]>
    remember(appId: number, httpStatus: number, candidateCount: number, now: Date): Promise<boolean>
    saveGame(game: CatalogGame, ownedAppIds: number[]): Promise<SaveResult>
}

export function steamOwnershipBlock(app: { appid: number; name: string }): 'demo' | 'software' | 'launcher' | null {
    const known = KNOWN_INELIGIBLE.get(app.appid)
    if (known) return known
    const name = app.name.normalize('NFKC').trim()
    if (/\bdemos?\b/i.test(name) || /\bplaytest\b/i.test(name)) return 'demo'
    if (/\blaunchers?\b/i.test(name)) return 'launcher'
    if (/\b(?:sdk|benchmark|dedicated server|software)\b/i.test(name)) return 'software'
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

/** Ignores caller-supplied user ids and app ids. Only an explicit retry flag is read. */
export function parseSteamImportRequest(input: unknown): { retry: boolean } {
    if (input == null) return { retry: false }
    if (typeof input !== 'object' || Array.isArray(input)) throw new SteamImportInputError('Invalid import request.')
    const record = input as Record<string, unknown>
    if ('retry' in record && typeof record.retry !== 'boolean') throw new SteamImportInputError('Invalid import request.')
    return { retry: record.retry === true }
}

export function buildSteamLinkEntries(input: {
    owned: { appid: number; playtimeMinutes: number }[]
    matches: SteamMatch[]
    cards: { id: string; name: string; coverImageUrl: string | null; released: string | null; developer: string }[]
    library: { gameId: string; hoursPlayed: number | null; status: string; playCount: number | null; completedAllAchievements: boolean | null }[]
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
            playtimeSelected: saved?.hoursPlayed != null ? saved.hoursPlayed : hoursFromSteamMinutes(minutes),
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

export function createDbSteamImportStore(): SteamImportStore {
    return {
        async mappings(appIds) {
            const matches: SteamMatch[] = []
            for (const chunk of chunks(appIds, STEAM_LOOKUP_BATCH)) {
                const rows = await db.select({ externalId: gameExternalIds.externalId, gameId: gameExternalIds.gameId })
                    .from(gameExternalIds)
                    .where(and(eq(gameExternalIds.provider, 'steam'), inArray(gameExternalIds.externalId, chunk.map(String))))
                for (const row of rows) {
                    const appid = Number(row.externalId)
                    if (Number.isSafeInteger(appid)) matches.push({ appid, gameId: row.gameId })
                }
            }
            return matches
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
            try {
                return await db.transaction(async tx => {
                    await tx.execute(sql`set local lock_timeout = '5s'`)
                    await tx.execute(sql`set local statement_timeout = '15s'`)
                    const prepared = await omitForeignSteamIds(tx, game)
                    const keep = owned.filter(id => prepared.game.steamAppIds.includes(id))
                    if (!keep.length) return { id: null, attached: [], rejected: owned }
                    const saved = await writeCatalogGame(tx, prepared.game)
                    const attached: number[] = []
                    const rejected: number[] = []
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
                    return { id: saved.id, attached, rejected }
                })
            } catch (error) {
                if (error instanceof Error && error.message.includes('already associated')) return { id: null, attached: [], rejected: owned }
                throw error
            }
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
        for (const [igdbId, appIds] of ownedByIgdb) {
            const game = gamesByIgdb.get(igdbId)
            if (!game) { pushUnique(retryable, appIds); continue }
            const present = appIds.filter(appid => game.steamAppIds.includes(appid))
            const absent = appIds.filter(appid => !game.steamAppIds.includes(appid))
            pushUnique(retryable, absent)
            if (!present.length) continue
            try {
                const saved = await store.saveGame(game, present)
                if (saved.id) for (const appid of saved.attached) matched.push({ appid, gameId: saved.id })
                pushUnique(ambiguous, saved.rejected)
                for (const appid of saved.rejected) await store.remember(appid, 200, 2, now)
            } catch (error) {
                // One game's failure must not abort the rest of the import, and must not be cached as a miss.
                logger.error('catalog:steam-import', 'Steam catalogue write failed', { error: error instanceof Error ? error.message : String(error) })
                pushUnique(retryable, present)
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
    const library = await getLibraryEntries(userId, {})
    const wanted = new Set(gameIds)
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
        library: library.filter(entry => wanted.has(entry.game_id)).map(entry => ({
            gameId: entry.game_id,
            hoursPlayed: entry.hours_played == null ? null : Number(entry.hours_played),
            status: entry.status,
            playCount: entry.play_count,
            completedAllAchievements: entry.completed_all_achievements,
        })),
        completedAppIds,
    })
}

export async function loadSteamImportPreview(userId: string, steamId: string, owned: OwnedSteamApp[]): Promise<SteamImportPreview> {
    const now = new Date()
    const store = createDbSteamImportStore()
    const inspected = await inspectOwned(owned, store, now)
    const completed = inspected.matches.length
        ? await getFullyCompletedAppids(steamId, inspected.matches.map(match => match.appid))
        : new Set<number>()
    const entries = await loadEntries(userId, owned, inspected.matches, completed)
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

export async function runSteamImportBatch(userId: string, retry: boolean): Promise<SteamImportBatch | { error: string }> {
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
    const now = new Date()
    const store = createDbSteamImportStore()
    const before = await inspectOwned(owned, store, now)
    const beforeApps = new Set(before.matches.map(match => match.appid))
    const queue = (retry ? [...before.pendingAppIds, ...before.cachedUnmatchedAppIds] : before.pendingAppIds).sort((a, b) => a - b)
    const batch = queue.slice(0, STEAM_IMPORT_BATCH)
    let resolved: ResolveSteamBatchResult = { matched: [], unmatched: [], ambiguous: [], retryable: [] }
    if (batch.length) {
        const nameById = new Map(owned.map(app => [app.appid, app.name]))
        try {
            resolved = await resolveSteamBatch(batch.map(appid => ({ appid, name: nameById.get(appid) ?? '' })), { retry, now, store })
        } catch (error) {
            logger.error('catalog:steam-import', 'Steam batch failed', { error: error instanceof Error ? error.message : String(error) })
            return { error: 'Matching is unavailable. Your matched games are still listed.' }
        }
    }
    const after = await inspectOwned(owned, store, now)
    const newAppIds = after.matches.map(match => match.appid).filter(appid => !beforeApps.has(appid))
    const completed = newAppIds.length ? await getFullyCompletedAppids(steamId, newAppIds) : new Set<number>()
    const entries = await loadEntries(userId, owned, after.matches, completed)
    const retryableIds = new Set(resolved.retryable)
    return {
        entries,
        remaining: after.pendingAppIds.filter(appid => !retryableIds.has(appid)).length,
        totalApps: owned.length,
        matchedGameCount: entries.length,
        unmatchedAppCount: after.unmatchedAppIds.length,
        ambiguousAppCount: after.ambiguousAppIds.length,
        retryableAppCount: resolved.retryable.length,
    }
}

export async function confirmSteamLibraryEntries(
    userId: string,
    entries: SteamLinkEntry[],
    owned: OwnedSteamApp[],
    deps: { store?: SteamImportStore; write?: (userId: string, rows: SteamLinkEntry[]) => Promise<unknown> } = {},
): Promise<SteamLinkEntry[]> {
    const deduped = dedupeSteamLinkEntries(entries)
    if (!deduped.length) return []
    if (deduped.some(entry => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.gameId))) {
        throw new SteamImportInputError('Choose games from your Steam library and try again.')
    }
    const store = deps.store ?? createDbSteamImportStore()
    const write = deps.write ?? upsertLibraryEntries
    const eligible = dedupeOwnedApps(owned).filter(app => !steamOwnershipBlock(app))
    const matches = await store.mappings(eligible.map(app => app.appid))
    const allowed = new Set(matches.map(match => match.gameId))
    if (deduped.some(entry => !allowed.has(entry.gameId))) {
        throw new SteamImportInputError('Choose games from your Steam library and try again.')
    }
    await write(userId, deduped)
    return deduped
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
