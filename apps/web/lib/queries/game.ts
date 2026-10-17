import { sql, and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { games, gameGenres, gamePlatforms, gameDevelopers, gamePublishers, genres, platforms, developers, publishers, gameExternalIds } from '@/db/schema'
import { GameData } from '@screenpeak/shared/types'
import { uuidArrayParam } from '@/lib/sql-helpers'
import { logger } from '@/lib/logger'
import { selectHeroGame, type HeroGame } from '@/lib/hero-game'

export async function getGameBySlug(slug: string) {
    // A database error must reject. Returning null here makes an outage look
    // like a missing game (404) on the page and the API.
    const rows = await db
        .select({
            id: games.id,
            created_at: games.createdAt,
            igdb_id: games.igdbId,
            name: games.name,
            slug: games.slug,
            cover_image_url: games.coverImageUrl,
            artwork_image_url: games.artworkImageUrl,
            released: games.released,
            description: games.description,
            esrb_rating: games.esrbRating,
            reddit_url: games.redditUrl,
            screenshots: games.screenshots,
        })
        .from(games)
        .where(eq(games.slug, slug))
        .limit(1)

    return rows[0] ?? null
}

// Just the id, for endpoints addressed by slug that don't need the game itself
// (e.g. GET /api/v1/games/[slug]/reviews).
export async function getGameIdBySlug(slug: string): Promise<string | null> {
    const rows = await db.select({ id: games.id }).from(games).where(eq(games.slug, slug)).limit(1)
    return rows[0]?.id ?? null
}

export async function getGameTaxonomy(gameId: string) {
    const [genreRows, platformRows, developerRows, publisherRows] = await Promise.all([
        db.select({ id: genres.id, name: genres.name, slug: genres.slug })
            .from(gameGenres)
            .innerJoin(genres, eq(gameGenres.genreId, genres.id))
            .where(eq(gameGenres.gameId, gameId)),
        db.select({ id: platforms.id, name: platforms.name, slug: platforms.slug })
            .from(gamePlatforms)
            .innerJoin(platforms, eq(gamePlatforms.platformId, platforms.id))
            .where(eq(gamePlatforms.gameId, gameId)),
        db.select({ id: developers.id, name: developers.name, slug: developers.slug })
            .from(gameDevelopers)
            .innerJoin(developers, eq(gameDevelopers.developerId, developers.id))
            .where(eq(gameDevelopers.gameId, gameId)),
        db.select({ id: publishers.id, name: publishers.name, slug: publishers.slug })
            .from(gamePublishers)
            .innerJoin(publishers, eq(gamePublishers.publisherId, publishers.id))
            .where(eq(gamePublishers.gameId, gameId)),
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
    // A database error must reject. Returning [] makes an outage look like an
    // empty catalogue. Web pages that still want that fallback catch here.
    const rows = await db.execute(sql`
        select * from query_games(
            p_q => ${params.q ?? null},
            p_genre => ${params.genre ?? null},
            p_platform => ${params.platform ?? null},
            p_developer => ${params.developer ?? null},
            p_publisher => ${params.publisher ?? null},
            p_esrb => ${params.esrb ?? null},
            p_sort => ${params.sort ?? 'name'},
            p_order => ${params.order ?? 'asc'},
            p_limit => ${params.limit ?? 10},
            p_offset => ${params.offset ?? 0},
            p_user_id => ${params.userId ?? null},
            p_game_ids => ${uuidArrayParam(params.gameIds)}
        )
    `)

    return rows as unknown as GameData[]
}

export { HERO_MIN_RATINGS } from '@/lib/hero-game'

// Public homepage and share image. Most ScreenPeak ratings among games with
// at least HERO_MIN_RATINGS, then community average, then id. No viewer data.
export async function getHeroGame(): Promise<HeroGame | null> {
    try {
        const rows = await db.execute(sql`
            select
                g.id,
                g.name,
                g.slug,
                g.cover_image_url,
                g.artwork_image_url,
                g.screenshots,
                g.released::text as released,
                round(avg(rr.rating)::numeric, 2) as avg_ngplus_rating,
                count(*)::int as rating_count
            from ratings_reviews rr
            join games g on g.id = rr.game_id
            group by g.id
        `)
        return selectHeroGame(rows as unknown as Parameters<typeof selectHeroGame>[0])
    } catch (error) {
        // Absence is a null return with no log. A failed query is the same
        // fallback for the page, and the log is what tells the two apart.
        logger.error('hero', 'hero game query failed', {
            error: error instanceof Error ? error.message : String(error),
        })
        return null
    }
}

export async function getAllGenres() {
    return await db.select({ id: genres.id, name: genres.name, slug: genres.slug }).from(genres)
}

export async function getAllPlatforms() {
    return await db.select({ id: platforms.id, name: platforms.name, slug: platforms.slug }).from(platforms)
}

export async function getDistinctEsrbRatings(): Promise<string[]> {
    const rows = await db.select({ esrb_rating: games.esrbRating }).from(games)
    return [...new Set(rows.map(row => row.esrb_rating))].filter((rating): rating is string => rating !== null).sort()
}

export async function getGamesFromSteamIds(gameIds: number[]) {
    if (gameIds.length === 0) return []

    const CHUNK_SIZE = 100
    const wanted = [...new Set(gameIds)]
    const results: { id: string, name: string, slug: string, cover_image_url: string | null, released: string | null, steam_appid: number }[] = []
    const seen = new Set<number>()
    // One game can match several Steam apps; callers collapse on game id.
    // Matches come from game_external_ids. games.steam_appid is dropped by 0007.
    try {
        for (let i = 0; i < wanted.length; i += CHUNK_SIZE) {
            const chunk = wanted.slice(i, i + CHUNK_SIZE)
            const external = await db
                .select({
                    id: games.id,
                    name: games.name,
                    slug: games.slug,
                    cover_image_url: games.coverImageUrl,
                    released: games.released,
                    steam_appid: gameExternalIds.externalId,
                })
                .from(gameExternalIds)
                .innerJoin(games, eq(games.id, gameExternalIds.gameId))
                .where(and(eq(gameExternalIds.provider, 'steam'), inArray(gameExternalIds.externalId, chunk.map(String))))
            for (const row of external) {
                const steam_appid = Number(row.steam_appid)
                if (!Number.isInteger(steam_appid) || seen.has(steam_appid)) continue
                seen.add(steam_appid)
                results.push({ id: row.id, name: row.name, slug: row.slug, cover_image_url: row.cover_image_url, released: row.released, steam_appid })
            }
        }
    } catch (error) {
        logger.error('queries:game', 'Failed to fetch games by steam appid', { error: error instanceof Error ? error.message : String(error) })
        throw error
    }

    return results
}
