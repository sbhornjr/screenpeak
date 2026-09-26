import { SteamOwnedGames } from "@/types/steam"
import { logger } from "./logger";

const STEAM_API_BASE = 'https://api.steampowered.com'

export async function getOwnedGames(steamId: string): Promise<SteamOwnedGames> {
    const url = `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v1/?key=${process.env.STEAM_API_KEY!}&steamid=${steamId}&format=json&include_played_free_games=true&include_appinfo=true`

    const res = await fetch(url)

    if (!res.ok) {
        logger.error("lib:steam", `GetOwnedGames failed with status ${res.status}`, { steamId })
        throw new Error(`Steam GetOwnedGames failed with status ${res.status}`)
    }

    const { response } = await res.json()

    // response is `{}` (no game_count/games) when the profile's game
    // details aren't public — callers should check for that explicitly
    // rather than treating it as "owns zero games"
    return {
        game_count: response.game_count,
        games: response.games,
    }
}

// Whether a player has unlocked every achievement in a given game. Steam
// returns a non-2xx status for the very common case of a game with no
// achievements/stats at all (most games don't have any) — that's not an
// error, just "nothing to report" for this game, so it isn't logged.
export async function getPlayerAchievementCompletion(steamId: string, appid: number): Promise<boolean> {
    const url = `${STEAM_API_BASE}/ISteamUserStats/GetPlayerAchievements/v1/?key=${process.env.STEAM_API_KEY!}&steamid=${steamId}&appid=${appid}&format=json`

    try {
        const res = await fetch(url)
        if (!res.ok) return false

        const { playerstats } = await res.json()

        // success is false when the achievements are private or the game
        // has no stats — either way there's nothing to report
        if (!playerstats?.success || !playerstats.achievements?.length) return false

        return (playerstats.achievements as { achieved: number }[]).every(a => a.achieved === 1)
    } catch (err) {
        logger.warn("lib:steam", "GetPlayerAchievements request failed", { steamId, appid, err: String(err) })
        return false
    }
}

// Runs getPlayerAchievementCompletion over a whole Steam library with bounded
// concurrency, mirroring importGamesFromSteam's worker pool in lib/rawg.ts —
// a plain sequential loop over a few hundred games would make /steamlink take
// minutes to load. Returns the set of appids the player has 100%'d.
export async function getFullyCompletedAppids(steamId: string, appids: number[], concurrency = 8): Promise<Set<number>> {
    const completed = new Set<number>()
    let index = 0

    async function worker() {
        while (index < appids.length) {
            const appid = appids[index++]
            if (await getPlayerAchievementCompletion(steamId, appid)) completed.add(appid)
        }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, appids.length) }, worker))

    return completed
}
