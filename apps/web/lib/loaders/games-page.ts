import 'server-only'
import type { GamesListPage, GamesListQuery } from '@screenpeak/shared/api/games'
import type { TaxonomySearchTable } from '@screenpeak/shared/api/search'
import { TAXONOMY_SLUG_MAX_LENGTH } from '@screenpeak/shared/constants'
import { getAllGenres, getAllPlatforms, getDeveloperNameMap, getDistinctEsrbRatings, getTaxonomyNameBySlug, queryGames } from '@/lib/queries/game'
import { gameCard, int } from '@/lib/loaders/shape'

export async function loadGamesPage(query: GamesListQuery, viewerId: string | null): Promise<GamesListPage> {
    const [rows, genres, platforms, esrb, developerName, publisherName] = await Promise.all([
        queryGames({
            q: query.q,
            genre: query.genre,
            platform: query.platform,
            developer: query.developer,
            publisher: query.publisher,
            esrb: query.esrb,
            sort: query.sort,
            order: query.order,
            limit: query.pageSize,
            offset: (query.page - 1) * query.pageSize,
            userId: viewerId,
            gameIds: null,
        }),
        getAllGenres(),
        getAllPlatforms(),
        getDistinctEsrbRatings(),
        filterName('developers', query.developer),
        filterName('publishers', query.publisher),
    ])

    const developers = await getDeveloperNameMap(rows.map(game => game.id))
    const total = int(rows[0]?.total_count)

    return {
        games: rows.map(game => gameCard(game, developers.get(String(game.id)) ?? null)),
        total,
        total_pages: query.pageSize > 0 ? Math.ceil(total / query.pageSize) : 0,
        genres,
        platforms,
        esrb_ratings: esrb,
        filter_names: { developer: developerName, publisher: publisherName },
        viewer: viewerId ? { id: viewerId } : null,
    }
}

// A slug no table could hold is shown as-is by the client; it is not a lookup error.
async function filterName(table: TaxonomySearchTable, slug: string | null): Promise<string | null> {
    if (!slug || slug.length > TAXONOMY_SLUG_MAX_LENGTH) return null
    return (await getTaxonomyNameBySlug(table, slug)) || null
}
