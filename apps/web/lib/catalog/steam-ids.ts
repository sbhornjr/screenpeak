import { sql, type SQL } from 'drizzle-orm'
import type { CatalogGame } from './types'

export function detachSharedSteamAppIds(games: CatalogGame[]): {
    games: CatalogGame[]
    shared: { appId: number; igdbIds: number[] }[]
} {
    const owners = new Map<number, number[]>()
    for (const game of games) {
        for (const appId of new Set(game.steamAppIds)) owners.set(appId, [...(owners.get(appId) ?? []), game.igdbId])
    }
    const shared = [...owners.entries()]
        .filter(([, ids]) => new Set(ids).size > 1)
        .map(([appId, ids]) => ({ appId, igdbIds: [...new Set(ids)].sort((a, b) => a - b) }))
        .sort((a, b) => a.appId - b.appId)
    const sharedIds = new Set(shared.map(entry => entry.appId))
    return {
        shared,
        games: games.map(game => ({ ...game, steamAppIds: game.steamAppIds.filter(id => !sharedIds.has(id)) })),
    }
}

type Executor = { execute: (query: SQL) => Promise<readonly { external_id: string; igdb_id: number | null }[]> }

/** Drop app ids already stored on a different IGDB game. The writer still rejects one that gets through. */
export async function omitForeignSteamIds(tx: Executor, game: CatalogGame): Promise<{ game: CatalogGame; omitted: number[] }> {
    const ids = [...new Set(game.steamAppIds)]
    if (!ids.length) return { game, omitted: [] }
    const rows = await tx.execute(sql`select e.external_id, g.igdb_id from public.game_external_ids e
        join public.games g on g.id = e.game_id
        where e.provider = 'steam' and e.external_id in (${sql.join(ids.map(id => sql`${String(id)}`), sql`, `)})`)
    const foreign = new Set(rows.filter(row => row.igdb_id !== game.igdbId).map(row => Number(row.external_id)))
    return {
        omitted: ids.filter(id => foreign.has(id)),
        game: { ...game, steamAppIds: game.steamAppIds.filter(id => !foreign.has(id)) },
    }
}
