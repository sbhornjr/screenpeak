import 'server-only'
import { sql } from 'drizzle-orm'
import type { DB } from '@/lib/db'
import { writeCatalogGame } from './upsert'
import { detachSharedSteamAppIds, omitForeignSteamIds } from './steam-ids'
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
export async function seedCatalogGames(database: Database, games: CatalogGame[]) {
    const detached = detachSharedSteamAppIds(games)
    const omittedForeign: { igdbId: number; appIds: number[] }[] = []
    let written = 0
    let batches = 0
    for (let offset = 0; offset < detached.games.length; offset += SEED_BATCH) {
        const batch = detached.games.slice(offset, offset + SEED_BATCH)
        try {
            const omitted = await database.transaction(async tx => {
                await tx.execute(sql`set local lock_timeout = '5s'`)
                await tx.execute(sql`set local statement_timeout = '2min'`)
                const found: { igdbId: number; appIds: number[] }[] = []
                for (const game of batch) {
                    const prepared = await omitForeignSteamIds(tx, game)
                    if (prepared.omitted.length) found.push({ igdbId: game.igdbId, appIds: prepared.omitted })
                    await writeCatalogGame(tx, prepared.game)
                }
                return found
            })
            omittedForeign.push(...omitted)
            written += batch.length
            batches += 1
        } catch (error) {
            if (error instanceof SeedInterrupted) throw error
            throw new SeedInterrupted(written, detached.games.slice(offset).map(game => game.igdbId), error)
        }
    }
    return { written, batches, shared: detached.shared, omittedForeign }
}
