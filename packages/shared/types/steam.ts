export type SteamGame = {
    appid: number
    name: string
    playtime_2weeks?: number
    playtime_forever: number
}

// Already unwrapped from Steam's outer "response" envelope by getOwnedGames().
// game_count/games are both undefined when the profile's game details aren't
// public — Steam returns {"response": {}} in that case, not an error.
export type SteamOwnedGames = {
    game_count?: number
    games?: SteamGame[]
}

export type SteamLinkEntry = {
    gameId: string
    playtimeSelected: number
    status: string
    selected: boolean
    coverImageUrl: string | null
    gameName: string
    gameDeveloper: string
    gameReleased: string | null
    timesPlayed?: number
    completedAllAchievements: boolean
    /** Recomputed on the server at confirm. The client value is ignored. */
    steamPlaytimeMinutes?: number | null
}

/**
 * Where the next import batch should resume. `pending` is apps that were never
 * cached. `miss` is a one-pass walk of cached misses after the user asks to retry.
 */
export type SteamImportCursor = { phase: 'pending' | 'miss'; afterAppId: number }

/** One round of IGDB matching. Counts of Steam apps and ScreenPeak games stay separate. */
export type SteamImportBatch = {
    entries: SteamLinkEntry[]
    remaining: number
    totalApps: number
    matchedGameCount: number
    unmatchedAppCount: number
    ambiguousAppCount: number
    retryableAppCount: number
    /** Non-null while this cycle still has apps the next call should visit. */
    nextCursor: SteamImportCursor | null
    /** Set when this user already holds the import turn. Entries stay as they were. */
    notice?: string
    /** Milliseconds to wait before asking again while `notice` is set. */
    retryAfterMs?: number
}

/** Minutes already stored for a Steam-sourced library row. Null means the hours were chosen by hand. */
export type SteamLibrarySnapshot = {
    gameId: string
    hoursPlayed: number | null
    status: string
    playCount: number | null
    completedAllAchievements: boolean | null
    steamPlaytimeMinutes: number | null
}