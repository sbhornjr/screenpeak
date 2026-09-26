import type { SupabaseClient } from '@supabase/supabase-js'

type RawgNamedRef = { id: number, name: string, slug: string }

type RawgGame = {
    id: number
    slug: string
    name: string
    background_image?: string | null
    released?: string | null
    metacritic?: number | null
    esrb_rating?: { name: string } | null
    short_screenshots?: { image: string }[]
    genres?: RawgNamedRef[]
    platforms?: { platform: RawgNamedRef }[]
}

type RawgGameDetails = {
    description_raw?: string | null
    reddit_url?: string | null
    developers?: RawgNamedRef[]
    publishers?: RawgNamedRef[]
}

const RAWG_KEY = process.env.RAWG_API_KEY!
const RAWG_BASE = 'https://api.rawg.io/api'

// -------------------------------------------------------
// In-memory caches — avoids re-upserting the same genre,
// platform, developer, or publisher over and over
// -------------------------------------------------------
const genreCache = new Map<number, string>()    // rawg_id → our uuid
const platformCache = new Map<number, string>()
const developerCache = new Map<number, string>()
const publisherCache = new Map<number, string>()

// -------------------------------------------------------
// Generic upsert helper for the four "lookup" tables
// -------------------------------------------------------
async function upsertLookup(
    supabase: SupabaseClient,
    cache: Map<number, string>,
    table: 'genres' | 'platforms' | 'developers' | 'publishers',
    rawgId: number,
    name: string,
    slug: string
): Promise<string | null> {
    // Return cached uuid if we've already upserted this one
    if (cache.has(rawgId)) return cache.get(rawgId)!

    const { data, error } = await supabase
        .from(table)
        .upsert({ rawg_id: rawgId, name, slug }, { onConflict: 'rawg_id' })
        .select('id')
        .single()

    if (error || !data) {
        console.error(`Failed to upsert ${table} "${name}":`, error)
        return null
    }

    cache.set(rawgId, data.id)
    return data.id
}

// -------------------------------------------------------
// Upsert a join table row (game_genres, game_platforms, etc)
// -------------------------------------------------------
async function upsertJoin(
    supabase: SupabaseClient,
    table: 'game_genres' | 'game_platforms' | 'game_developers' | 'game_publishers',
    gameId: string,
    foreignKey: string,
    foreignValue: string
) {
    await supabase
        .from(table)
        .upsert(
            { game_id: gameId, [foreignKey]: foreignValue },
            { onConflict: `game_id,${foreignKey}` }
        )
}

// -------------------------------------------------------
// Fetch full game details from RAWG (includes description,
// developers, publishers, reddit_url — not in list response)
// -------------------------------------------------------
async function fetchGameDetails(slug: string): Promise<RawgGameDetails> {
    const res = await fetch(`${RAWG_BASE}/games/${slug}?key=${RAWG_KEY}`)
    return res.json()
}

// -------------------------------------------------------
// Seed a single game: upsert core data, then all relations.
// Returns the upserted games row (at least its id), or null
// if the upsert failed — callers need the id to link it into
// a library_entries row.
// -------------------------------------------------------
export async function seedGame(supabase: SupabaseClient, rawgGame: RawgGame, steamAppId?: number) {
    const details = await fetchGameDetails(rawgGame.slug)

    // Upsert the game itself
    const { data: game, error } = await supabase
        .from('games')
        .upsert({
            rawg_id: rawgGame.id,
            name: rawgGame.name,
            slug: rawgGame.slug,
            cover_image_url: rawgGame.background_image ?? null,
            released: rawgGame.released ?? null,
            metacritic_score: rawgGame.metacritic ?? null,
            description: details.description_raw ?? null,
            esrb_rating: rawgGame.esrb_rating?.name ?? null,
            reddit_url: details.reddit_url ?? null,
            screenshots: (rawgGame.short_screenshots ?? [])
                .map(s => s.image)
                .filter(Boolean),
            ...(steamAppId ? { steam_appid: steamAppId } : {}),
        }, { onConflict: 'rawg_id' })
        .select('id')
        .single()

    if (error || !game) {
        console.error(`Failed to upsert game "${rawgGame.name}":`, error)
        return null
    }

    const gameId = game.id

    // Genres
    for (const g of rawgGame.genres ?? []) {
        const id = await upsertLookup(supabase, genreCache, 'genres', g.id, g.name, g.slug)
        if (id) await upsertJoin(supabase, 'game_genres', gameId, 'genre_id', id)
    }

    // Platforms
    for (const p of rawgGame.platforms ?? []) {
        const { id: rawgPlatformId, name, slug } = p.platform
        const id = await upsertLookup(supabase, platformCache, 'platforms', rawgPlatformId, name, slug)
        if (id) await upsertJoin(supabase, 'game_platforms', gameId, 'platform_id', id)
    }

    // Developers (from detail response)
    for (const d of details.developers ?? []) {
        const id = await upsertLookup(supabase, developerCache, 'developers', d.id, d.name, d.slug)
        if (id) await upsertJoin(supabase, 'game_developers', gameId, 'developer_id', id)
    }

    // Publishers (from detail response)
    for (const p of details.publishers ?? []) {
        const id = await upsertLookup(supabase, publisherCache, 'publishers', p.id, p.name, p.slug)
        if (id) await upsertJoin(supabase, 'game_publishers', gameId, 'publisher_id', id)
    }

    return game
}

// -------------------------------------------------------
// Fetch a page of games from RAWG
// -------------------------------------------------------
export async function fetchGames(page?: number, search?: string, pageSize?: number, metacritic?: string) {
    const params = new URLSearchParams({
        key: RAWG_KEY,
        page: String(page ?? 1),
        page_size: String(pageSize ?? 40),
        // Only applied when browsing (no search term) — verified RAWG treats
        // "additions" much more broadly than DLC: it excludes legitimate
        // standalone re-releases too ("Ori and the Blind Forest: Definitive
        // Edition", "Metro 2033 Redux" are both excluded by this filter, and
        // are otherwise the #1 result). A name search is looking for one
        // specific game the user actually owns, so we don't want to lose it
        // to a filter meant for keeping DLC out of the bulk-browsed catalog.
        ...(search ? {} : { exclude_additions: 'true' }),
        ...(metacritic ? { metacritic } : {}),
        // Rating-ordering makes sense when browsing (seed-games.ts), but a
        // name search needs RAWG's own relevance ranking — forcing rating
        // order was pushing the actual match off the page entirely for
        // well-known games that just weren't the highest-rated result for
        // some loosely-matching search token.
        //
        // search_exact was tried and removed — verified empirically that it
        // isn't "prefer exact matches", it's "only return a strict backend
        // match", and it returns zero results for plenty of games that a
        // plain search finds immediately (e.g. "Cat Quest III", "Blasphemous
        // 2" both returned count:0 with it set).
        ...(search ? { search } : { ordering: '-rating' }),
    })
    const res = await fetch(`${RAWG_BASE}/games?${params}`)
    const data = await res.json()
    return data.results as RawgGame[]
}

// -------------------------------------------------------
// Funnel path: a Steam-owned game with no games.steam_appid
// match. Searches RAWG by name and, on an exact match, seeds
// it into the catalog tagged with steamAppId so the next user
// who owns it hits the cheap exact-match path instead of
// repeating this search. Returns the games row, or null if no
// confident match was found.
// -------------------------------------------------------
const ROMAN_NUMERALS: Record<string, string> = {
    ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10',
}

// Conservative normalization for comparing a Steam game name against RAWG's —
// only strips formatting noise that's never actually part of a game's real
// name (trademark symbols, stray punctuation, whitespace/dash/colon/quote
// variants, roman-vs-arabic sequel numbering — RAWG has "Blasphemous II"
// where Steam has "Blasphemous 2", "Immortals: Fenyx Rising" where Steam has
// no colon).
function normalizeGameName(name: string): string {
    return name
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip diacritics: "ABZÛ" -> "ABZU"
        .toLowerCase()
        .replace(/[™®©]/g, '')
        .replace(/[-–—:]/g, ' ')
        .replace(/[’‘]/g, "'")
        .replace(/\bgoty\b/g, 'game of the year')
        .replace(/\b(ii|iii|iv|v|vi|vii|viii|ix|x)\b/g, m => ROMAN_NUMERALS[m])
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\.+$/, '')
}

// Strips a trailing "(YYYY)" disambiguator — RAWG uses these when multiple
// games share a title (e.g. "Dead Space (2008)" vs. the 2023 remake). Kept
// as a separate, lower-priority pass rather than folded into
// normalizeGameName: stripping it unconditionally risks matching the wrong
// game when RAWG's year suffix is disambiguating two real, different titles
// (e.g. "PEAK" the 2025 co-op game vs. an unrelated "PEAK (2015)") — this
// only applies once an exact match against every candidate has already
// failed.
function stripYearSuffix(name: string): string {
    return name.replace(/\s*\(\d{4}\)$/, '')
}

// Broader than stripYearSuffix — strips ANY trailing "(...)" qualifier, not
// just years (e.g. RAWG's "N++ (NPLUSPLUS)", Steam's own "Divinity: Original
// Sin (Classic)"). Kept as the last, loosest fallback for the same reason —
// only tried once every tighter comparison has failed for every candidate.
function stripTrailingParenthetical(name: string): string {
    return name.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

export async function importGameFromSteam(supabase: SupabaseClient, gameName: string, steamAppId: number) {
    const games = await fetchGames(1, gameName, 20)
    const targetName = normalizeGameName(gameName)
    const targetNameNoYear = stripYearSuffix(targetName)
    const targetNameNoParen = stripTrailingParenthetical(targetName)

    const game = games.find(g => normalizeGameName(g.name) === targetName)
        // RAWG's side has the year suffix Steam's name doesn't (Dead Space -> Dead Space (2008))
        ?? games.find(g => stripYearSuffix(normalizeGameName(g.name)) === targetName)
        // Steam's side has a year RAWG doesn't use (System Shock 2 (1999) -> System Shock 2)
        ?? games.find(g => normalizeGameName(g.name) === targetNameNoYear)
        // Either side has some other non-year parenthetical qualifier
        ?? games.find(g => stripTrailingParenthetical(normalizeGameName(g.name)) === targetNameNoParen)

    if (!game) {
        console.error(`No RAWG match found for Steam game "${gameName}"`)
        return null
    }

    return seedGame(supabase, game, steamAppId)
}

// Runs importGameFromSteam over a whole batch with bounded concurrency —
// a plain sequential loop over a few hundred games (each ~2 RAWG round
// trips) is what made the initial funnel pass take ~15 minutes. Concurrency
// is capped rather than unbounded to avoid bursting RAWG with hundreds of
// simultaneous requests at once.
export async function importGamesFromSteam(supabase: SupabaseClient, games: { name: string, appid: number }[], concurrency = 8) {
    let index = 0

    async function worker() {
        while (index < games.length) {
            const game = games[index++]
            await importGameFromSteam(supabase, game.name, game.appid)
        }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, games.length) }, worker))
}
