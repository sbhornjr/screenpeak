import type { SupabaseClient } from '@supabase/supabase-js'
import { sql, eq, ilike, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { games, gameGenres, gamePlatforms, gameDevelopers, gamePublishers, genres, platforms, developers, publishers } from '@/db/schema'
import { Game, GameData } from '@/types'

export async function getGameBySlug(slug: string) {
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

// Unchanged — called client-side (FavoriteGamePicker.tsx, AddToListFromListButton.tsx),
// a public unauthenticated search with no mutation risk. Stays on supabase-js.
export async function searchGamesByName(supabase: SupabaseClient, query: string, limit = 20): Promise<Game[]> {
    const { data } = await supabase
        .from('games')
        .select('id, name, slug, cover_image_url, metacritic_score, released')
        .ilike('name', `%${query}%`)
        .limit(limit)

    return data ?? []
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
            console.error('Failed to fetch developer names:', error)
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
            p_game_ids => ${params.gameIds ?? null}
        )
    `)

    return rows as unknown as GameData[]
}

export async function getAllGenres() {
    return db.select({ id: genres.id, name: genres.name, slug: genres.slug }).from(genres)
}

export async function getAllPlatforms() {
    return db.select({ id: platforms.id, name: platforms.name, slug: platforms.slug }).from(platforms)
}

export async function getDistinctEsrbRatings(): Promise<string[]> {
    const rows = await db.select({ esrb_rating: games.esrbRating }).from(games)
    return [...new Set(rows.map(row => row.esrb_rating))].filter((rating): rating is string => rating !== null).sort()
}

type TaxonomyTable = 'developers' | 'publishers'

// Unchanged — called from SearchableDropdown.tsx ('use client'), stays on supabase-js.
export async function searchTaxonomyTable(supabase: SupabaseClient, table: TaxonomyTable, query: string, limitToIds?: string[]) {
    let q = supabase
        .from(table)
        .select('id, name, slug')
        .ilike('name', `%${query}%`)
        .order('name')
        .limit(20)

    if (limitToIds && limitToIds.length > 0) {
        q = q.in('id', limitToIds)
    }

    const { data } = await q
    return data ?? []
}

// Unchanged — called from SearchableDropdown.tsx ('use client'), stays on supabase-js.
export async function getTaxonomyNameBySlug(supabase: SupabaseClient, table: TaxonomyTable, slug: string) {
    const { data } = await supabase
        .from(table)
        .select('name')
        .eq('slug', slug)
        .single()

    return data?.name ?? ''
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
            console.error('Failed to fetch games by steam appid:', error)
            throw error
        }
    }

    return results
}
