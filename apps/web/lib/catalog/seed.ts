import 'server-only'
import { sql } from 'drizzle-orm'
import type { DB } from '@/lib/db'
import { writeCatalogGame } from './upsert'
import { detachSharedSteamAppIds, omitForeignSteamIds } from './steam-ids'
import type { CatalogGame } from './types'

/** Upsert staged games only. Never clears library, reviews, lists, or accounts. */
export async function seedCatalogGames(database: Pick<DB, 'transaction'>, games: CatalogGame[]) {
    const detached = detachSharedSteamAppIds(games)
    const omittedForeign: { igdbId: number; appIds: number[] }[] = []
    for (const game of detached.games) {
        await database.transaction(async tx => {
            await tx.execute(sql`set local lock_timeout = '5s'`)
            await tx.execute(sql`set local statement_timeout = '15s'`)
            const prepared = await omitForeignSteamIds(tx, game)
            if (prepared.omitted.length) omittedForeign.push({ igdbId: game.igdbId, appIds: prepared.omitted })
            await writeCatalogGame(tx, prepared.game)
        })
    }
    return { written: detached.games.length, shared: detached.shared, omittedForeign }
}
