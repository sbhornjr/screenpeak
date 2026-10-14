import 'server-only'
import { sql } from 'drizzle-orm'
import type { DB } from '@/lib/db'
import { writeCatalogBatch } from './batch-write'
import { detachSharedSteamAppIds, omitForeignSteamIdsBatch } from './steam-ids'
import type { SeedProgress } from './seed-progress'
import type { CatalogGame } from './types'

export const SEED_BATCH = 50

export class SeedInterrupted extends Error {
    readonly committed: number
    readonly remainingIgdbIds: number[]
    constructor(committed: number, remainingIgdbIds: number[], cause: unknown) {
        super(`Seed stopped after ${committed} committed games. ${remainingIgdbIds.length} IGDB ids were not written`
            + (remainingIgdbIds.length ? `: ${remainingIgdbIds.slice(0, 20).join(',')}${remainingIgdbIds.length > 20 ? ',…' : ''}` : '')
            + '. Re-run with --resume. Cause: ' + (cause instanceof Error ? cause.message : String(cause)))
        this.committed = committed
        this.remainingIgdbIds = remainingIgdbIds
    }
}

type Database = Pick<DB, 'execute' | 'transaction'>

/** --resume drops ids already stored. It still starts from the full ranked list. */
export function idsToSeed(ranked: number[], stored: number[], resume: boolean): { ids: number[]; skippedExisting: number[] } {
    if (!resume) return { ids: ranked, skippedExisting: [] }
    const have = new Set(stored)
    const skippedExisting = ranked.filter(id => have.has(id))
    return { ids: ranked.filter(id => !have.has(id)), skippedExisting }
}

/**
 * Fewer ranked ids than `--top` asked for is a shortfall, including when
 * --resume then has nothing left to write. A quiet success is how a 200-row
 * page was stored as the whole catalogue.
 */
export function seedOutcome(target: number, ranked: number[], stored: number[], resume: boolean) {
    const selected = idsToSeed(ranked, stored, resume)
    return {
        target,
        ranked: ranked.length,
        ...selected,
        shortfall: ranked.length < target
            ? `IGDB returned ${ranked.length} rated main games, fewer than ${target}.`
            : null,
    }
}

/** Ids already stored, so --resume can skip them. Re-running without --resume upserts. */
export async function storedIgdbIds(database: Pick<DB, 'execute'>, ids: number[]): Promise<number[]> {
    if (!ids.length) return []
    const found: number[] = []
    for (let offset = 0; offset < ids.length; offset += 500) {
        const chunk = ids.slice(offset, offset + 500)
        const rows = await database.execute(sql`select igdb_id from public.games
            where igdb_id in (${sql.join(chunk.map(id => sql`${id}`), sql`, `)})`) as { igdb_id: number | null }[]
        for (const row of rows) if (row.igdb_id != null) found.push(Number(row.igdb_id))
    }
    return found
}

/** Upsert staged games in batches. Never clears library, reviews, lists, or accounts. */
export async function seedCatalogGames(database: Database, games: CatalogGame[], options: {
    onBatch?: (progress: { written: number; total: number; batches: number; ms: number; statements: number }) => void
    onPhase?: (event: SeedProgress) => void
} = {}) {
    const detachStarted = performance.now()
    const detached = detachSharedSteamAppIds(games)
    options.onPhase?.({
        phase: 'detach', games: detached.games.length, shared: detached.shared.length,
        ms: Math.round(performance.now() - detachStarted),
    })
    const omittedForeign: { igdbId: number; appIds: number[] }[] = []
    let written = 0
    let batches = 0
    for (let offset = 0; offset < detached.games.length; offset += SEED_BATCH) {
        const batch = detached.games.slice(offset, offset + SEED_BATCH)
        const from = offset + 1
        const to = offset + batch.length
        options.onPhase?.({ phase: 'writing', from, to, total: detached.games.length })
        const started = performance.now()
        let statements = 0
        try {
            const omitted = await database.transaction(async tx => {
                const counting = {
                    async execute(query: Parameters<typeof tx.execute>[0]) {
                        statements += 1
                        return tx.execute(query)
                    },
                }
                // A bulk statement is short. These limits fail a lock wait or a stuck
                // statement instead of leaving the batch silent for minutes.
                await counting.execute(sql`set local lock_timeout = '5s'`)
                await counting.execute(sql`set local statement_timeout = '30s'`)
                await counting.execute(sql`set local idle_in_transaction_session_timeout = '15s'`)
                const prepared = await omitForeignSteamIdsBatch(counting, batch)
                await writeCatalogBatch(counting, prepared.games)
                return prepared.omitted
            })
            omittedForeign.push(...omitted)
            written += batch.length
            batches += 1
            const progress = {
                written, total: detached.games.length, batches, statements,
                ms: Math.round(performance.now() - started),
            }
            options.onPhase?.({ phase: 'committed', ...progress })
            options.onBatch?.(progress)
        } catch (error) {
            if (error instanceof SeedInterrupted) throw error
            const message = error instanceof Error ? error.message : String(error)
            const cause = /lock timeout|statement timeout|idle-in-transaction/i.test(message)
                ? new Error(`${message} Stop every other seed and the app, then retry with --clear-budget --resume.`)
                : error
            throw new SeedInterrupted(written, detached.games.slice(offset).map(game => game.igdbId), cause)
        }
    }
    return { written, batches, shared: detached.shared, omittedForeign }
}
