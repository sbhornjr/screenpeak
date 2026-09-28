import { sql, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { games, ratingsReviews, gameGenres, gamePlatforms, gameDevelopers, gamePublishers, genres, platforms, developers, publishers } from '@/db/schema'
import { GameData } from '@screenpeak/shared/types'
import { uuidArrayParam } from '@/lib/sql-helpers'
import { logger } from '@/lib/logger'

export async function getGameBySlug(slug: string) {
    try {
        const rows = await db
            .select({
                id: games.id,
                created_at: games.createdAt,
                rawg_id: games.rawgId,
                name: games.name,
                slug: games.slug,
                cover_image_url: games.coverImageUrl,
                released: games.released,
                metacritic_score: games.metacriticScore,
                description: games.description,
                esrb_rating: games.esrbRating,
                reddit_url: games.redditUrl,
                screenshots: games.screenshots,
                steam_appid: games.steamAppid,
            })
            .from(games)
            .where(eq(games.slug, slug))
            .limit(1)

        return rows[0] ?? null
    } catch {
        return null
    }
}

export async function getGameTaxonomy(gameId: string) {
    const [genreRows, platformRows, developerRows, publisherRows] = await Promise.all([
        db.select({ id: genres.id, name: genres.name, slug: genres.slug })
            .from(gameGenres)
            .innerJoin(genres, eq(gameGenres.genreId, genres.id))
            .where(eq(gameGenres.gameId, gameId))
            .catch(() => []),
        db.select({ id: platforms.id, name: platforms.name, slug: platforms.slug })
            .from(gamePlatforms)
            .innerJoin(platforms, eq(gamePlatforms.platformId, platforms.id))
            .where(eq(gamePlatforms.gameId, gameId))
            .catch(() => []),
        db.select({ id: developers.id, name: developers.name, slug: developers.slug })
            .from(gameDevelopers)
            .innerJoin(developers, eq(gameDevelopers.developerId, developers.id))
            .where(eq(gameDevelopers.gameId, gameId))
            .catch(() => []),
        db.select({ id: publishers.id, name: publishers.name, slug: publishers.slug })
            .from(gamePublishers)
            .innerJoin(publishers, eq(gamePublishers.publisherId, publishers.id))
            .where(eq(gamePublishers.gameId, gameId))
            .catch(() => []),
    ])

    return {
        genres: genreRows,
        platforms: platformRows,
        developers: developerRows,
        publishers: publisherRows,
    }
}

// Maps game_id -> developer name for a set of games. Chunked — a large
// library/catalog can push the filter past a query-size limit.
export async function getDeveloperNameMap(gameIds: (string | number)[]): Promise<Map<string, string | null>> {
    const CHUNK_SIZE = 100
    const map = new Map<string, string | null>()

    for (let i = 0; i < gameIds.length; i += CHUNK_SIZE) {
        const chunk = gameIds.slice(i, i + CHUNK_SIZE).map(String)
        try {
            const rows = await db
                .select({ game_id: gameDevelopers.gameId, name: developers.name })
                .from(gameDevelopers)
                .innerJoin(developers, eq(gameDevelopers.developerId, developers.id))
                .where(inArray(gameDevelopers.gameId, chunk))

            for (const d of rows) {
                if (!map.has(String(d.game_id))) map.set(String(d.game_id), d.name ?? null)
            }
        } catch (error) {
            logger.error('queries:game', 'Failed to fetch developer names', { error: error instanceof Error ? error.message : String(error) })
            continue
        }
    }

    return map
}

type QueryGamesParams = {
    q?: string | null
    genre?: string | null
    platform?: string | null
    developer?: string | null
    publisher?: string | null
    esrb?: string | null
    sort?: string
    order?: string
    limit?: number
    offset?: number
    userId?: string | null
    gameIds?: (string | number)[] | null
}

export async function queryGames(params: QueryGamesParams): Promise<GameData[]> {
    try {
        const rows = await db.execute(sql`
            select * from query_games(
                p_q => ${params.q ?? null},
                p_genre => ${params.genre ?? null},
                p_platform => ${params.platform ?? null},
                p_developer => ${params.developer ?? null},
                p_publisher => ${params.publisher ?? null},
                p_esrb => ${params.esrb ?? null},
                p_sort => ${params.sort ?? 'metacritic_score'},
                p_order => ${params.order ?? 'desc'},
                p_limit => ${params.limit ?? 10},
                p_offset => ${params.offset ?? 0},
                p_user_id => ${params.userId ?? null},
                p_game_ids => ${uuidArrayParam(params.gameIds)}
            )
        `)

        return rows as unknown as GameData[]
    } catch {
        return []
    }
}

// A community average only means something once enough people have rated.
// Below this, one person could put any game in the hero by rating it.
export const HERO_MIN_RATINGS = 3

// The landing hero and the default share card both feature this game: among
// well-known titles with at least HERO_MIN_RATINGS community ratings, the one
// where critics and ScreenPeak players disagree most. Null until one qualifies.
export async function getHeroGame(): Promise<(GameData & { rating_count: number }) | null> {
    const candidates = (await queryGames({ sort: 'metacritic_score', order: 'desc', limit: 40, userId: null }))
        .filter(g => g.metacritic_score && g.avg_ngplus_rating)
    if (candidates.length === 0) return null

    let counts: Map<string, number>
    try {
        const rows = await db
            .select({ game_id: ratingsReviews.gameId, count: sql<number>`count(*)::int` })
            .from(ratingsReviews)
            .where(inArray(ratingsReviews.gameId, candidates.map(g => String(g.id))))
            .groupBy(ratingsReviews.gameId)
        counts = new Map(rows.map(r => [r.game_id, r.count]))
    } catch {
        return null
    }

    const gap = (g: GameData) => Math.abs(g.metacritic_score - g.avg_ngplus_rating * 10)
    const hero = candidates
        .map(g => ({ ...g, rating_count: counts.get(String(g.id)) ?? 0 }))
        .filter(g => g.rating_count >= HERO_MIN_RATINGS)
        .sort((a, b) => gap(b) - gap(a))[0]
    return hero ?? null
}

export async function getAllGenres() {
    try {
        return await db.select({ id: genres.id, name: genres.name, slug: genres.slug }).from(genres)
    } catch {
        return []
    }
}

export async function getAllPlatforms() {
    try {
        return await db.select({ id: platforms.id, name: platforms.name, slug: platforms.slug }).from(platforms)
    } catch {
        return []
    }
}

export async function getDistinctEsrbRatings(): Promise<string[]> {
    try {
        const rows = await db.select({ esrb_rating: games.esrbRating }).from(games)
        return [...new Set(rows.map(row => row.esrb_rating))].filter((rating): rating is string => rating !== null).sort()
    } catch {
        return []
    }
}

export async function getGamesFromSteamIds(gameIds: number[]) {
    if (gameIds.length === 0) return []

    const CHUNK_SIZE = 100
    const results: { id: string, name: string, slug: string, cover_image_url: string | null, released: string | null, steam_appid: number }[] = []

    for (let i = 0; i < gameIds.length; i += CHUNK_SIZE) {
        const chunk = gameIds.slice(i, i + CHUNK_SIZE)
        try {
            const rows = await db
                .select({
                    id: games.id,
                    name: games.name,
                    slug: games.slug,
                    cover_image_url: games.coverImageUrl,
                    released: games.released,
                    steam_appid: games.steamAppid,
                })
                .from(games)
                .where(inArray(games.steamAppid, chunk))

            results.push(...(rows as unknown as typeof results))
        } catch (error) {
            logger.error('queries:game', 'Failed to fetch games by steam appid', { error: error instanceof Error ? error.message : String(error) })
            throw error
        }
    }

    return results
}
