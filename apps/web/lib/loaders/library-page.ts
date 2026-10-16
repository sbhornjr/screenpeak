import 'server-only'
import type { LibraryPageData, LibraryQuery } from '@screenpeak/shared/api/library'
import { parseDbTimestamp } from '@/lib/dates'
import { getDeveloperNameMap, queryGames } from '@/lib/queries/game'
import { getLibraryEntries, getLibraryFacets } from '@/lib/queries/library'
import { getAccountSettings, getUserIdFromUsername } from '@/lib/queries/user'
import { gameCard, num, text } from '@/lib/loaders/shape'

const LIBRARY_LIMIT = 9999

/** Null when the player is missing or the library is private to this caller. */
export async function loadUserLibrary(
    username: string,
    viewerId: string | null,
    query: LibraryQuery,
): Promise<LibraryPageData | null> {
    const owner = await getUserIdFromUsername(username)
    if (!owner) return null

    const isOwner = viewerId === owner.id
    if (!isOwner) {
        const settings = await getAccountSettings(owner.id)
        if (!settings?.library_public) return null
    }

    const facets = await getLibraryFacets(owner.id)
    const entries = await getLibraryEntries(owner.id, {
        status: query.status,
        is100: query.is100,
        sort: query.sort,
        order: query.order,
    })
    const ids = entries.map(entry => String(entry.game_id))

    // An empty id list is NULL to query_games, which means the whole catalogue.
    const rows = ids.length === 0 ? [] : await queryGames({
        q: query.q,
        genre: query.genre,
        platform: query.platform,
        developer: query.developer,
        publisher: query.publisher,
        esrb: query.esrb,
        sort: query.sort === 'date_added' ? 'name' : query.sort,
        order: query.sort === 'date_added' ? 'asc' : query.order,
        userId: viewerId,
        gameIds: ids,
        limit: LIBRARY_LIMIT,
    })

    const entryById = new Map(entries.map(entry => [String(entry.game_id), entry]))
    const ordered = query.sort === 'date_added' ? byDateAdded(rows, entryById, query.order) : rows
    const developers = await getDeveloperNameMap(ordered.map(game => game.id))

    return {
        username,
        facets: {
            genres: facets.genres ?? [],
            platforms: facets.platforms ?? [],
            developers: facets.developers ?? [],
            publishers: facets.publishers ?? [],
            esrb_ratings: facets.esrbRatings ?? [],
        },
        games: ordered.map(game => {
            const entry = entryById.get(String(game.id))
            return {
                ...gameCard(game, developers.get(String(game.id)) ?? null),
                library_status: entry?.status ?? null,
                completed_all_achievements: entry?.completed_all_achievements ?? false,
                hours_played: entry?.hours_played == null ? null : num(entry.hours_played),
                play_count: entry?.play_count ?? 1,
            }
        }),
    }
}

function byDateAdded<T extends { id: unknown }>(
    games: T[],
    entries: Map<string, { created_at: unknown }>,
    order: 'asc' | 'desc',
): T[] {
    return [...games].sort((a, b) => {
        const aAt = entries.get(String(a.id))?.created_at
        const bAt = entries.get(String(b.id))?.created_at
        const aTime = aAt ? parseDbTimestamp(text(aAt) ?? '').getTime() : null
        const bTime = bAt ? parseDbTimestamp(text(bAt) ?? '').getTime() : null
        if (aTime == null && bTime == null) return String(a.id) < String(b.id) ? -1 : 1
        if (aTime == null) return 1
        if (bTime == null) return -1
        const delta = order === 'asc' ? aTime - bTime : bTime - aTime
        if (delta !== 0) return delta
        return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0
    })
}
