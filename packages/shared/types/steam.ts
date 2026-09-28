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
}