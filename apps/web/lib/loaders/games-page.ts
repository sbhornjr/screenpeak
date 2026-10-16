import 'server-only'
import type { GamesListPage, GamesListQuery } from '@screenpeak/shared/api/games'
import { getAllGenres, getAllPlatforms, getDeveloperNameMap, getDistinctEsrbRatings, queryGames } from '@/lib/queries/game'
import { gameCard, int } from '@/lib/loaders/shape'

export async function loadGamesPage(query: GamesListQuery, viewerId: string | null): Promise<GamesListPage> {
    const [rows, genres, platforms, esrb] = await Promise.all([
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
        viewer: viewerId ? { id: viewerId } : null,
    }
}
