import type { Metadata } from "next";
import { createClient } from "@/lib/supabase-server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createLoggingFetch } from "@/lib/supabase-logging";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/queries/user-auth";
import { getSteamAccount } from "@/lib/queries/steam";
import { getOwnedGames, getFullyCompletedAppids } from "@/lib/steam";
import { importGamesFromSteam } from "@/lib/rawg";
import { getGamesFromSteamIds, getDeveloperNameMap } from "@/lib/queries/game";
import { getLibraryEntries } from "@/lib/queries/library";
import { SteamLinkEntry } from "@screenpeak/shared/types";
import SteamLinkGamesSection from "../components/settings/SteamLinkGamesSection";

export const metadata: Metadata = {
    title: "Import from Steam",
    robots: { index: false },
}

export default async function SteamLinkPage() {
    const supabase = await createClient()
    const viewer = await getViewer(supabase)

    if (!viewer) redirect("/")

    const steamUser = await getSteamAccount(viewer.id)

    if (!steamUser || !steamUser.steam_id) redirect("/settings?steam_error=1")

    const steamGamesData = await getOwnedGames(steamUser.steam_id)
    if (!steamGamesData || !steamGamesData.games) redirect("/settings?steam_error=2")

    const ngPlusGamesSteamIds = await getGamesFromSteamIds(steamGamesData.games.map(g => g.appid))

    // Writing new rows into the shared games/genres/platforms/etc. catalog
    // needs elevated privileges — a regular user's RLS-scoped session client
    // can't (and shouldn't be able to) write there directly.
    const adminClient = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SECRET_KEY!,
        { global: { fetch: createLoggingFetch('admin') } }
    )

    const ngPlusGamesSteamIdsSet = new Set(ngPlusGamesSteamIds.map(d => d.steam_appid))
    const unmatchedSteamGames = steamGamesData.games.filter(g => !ngPlusGamesSteamIdsSet.has(g.appid))
    await importGamesFromSteam(adminClient, unmatchedSteamGames)

    const ngPlusGamesData = await getGamesFromSteamIds(steamGamesData.games.map(g => g.appid))
    const ngPlusGameIds = new Set(ngPlusGamesData.map(g => g.id))
    const libraryEntriesByGameId = new Map(
        (await getLibraryEntries(viewer.id, {}))
            .filter(le => ngPlusGameIds.has(le.game_id))
            .map(le => [le.game_id, le])
    )
    const developerMap = await getDeveloperNameMap(ngPlusGamesData.map(g => g.id))
    const steamGamesByAppid = new Map(steamGamesData.games.map(g => [g.appid, g]))
    const fullyCompletedAppids = await getFullyCompletedAppids(steamUser.steam_id, ngPlusGamesData.map(g => g.steam_appid))

    const steamLinkEntries = new Map<number, SteamLinkEntry>()
    for (const game of ngPlusGamesData) {
        const steamGame = steamGamesByAppid.get(game.steam_appid)
        const relevantLibraryEntry = libraryEntriesByGameId.get(game.id)
        const playtimeSteam = steamGame?.playtime_forever ?? 0 // minutes, per Steam's API
        const playtimeHours = relevantLibraryEntry?.hours_played != null ? Number(relevantLibraryEntry.hours_played) : Math.floor(playtimeSteam / 60)
        const status = relevantLibraryEntry ? relevantLibraryEntry.status : playtimeSteam > 0 ? "playing" : "backlog"
        const timesPlayed = relevantLibraryEntry?.play_count ? relevantLibraryEntry.play_count : playtimeSteam > 0 ? 1 : 0
        const completedAllAchievements = relevantLibraryEntry?.completed_all_achievements || fullyCompletedAppids.has(game.steam_appid)
        steamLinkEntries.set(game.steam_appid, { gameId: game.id, playtimeSelected: playtimeHours, status: status, selected: true, coverImageUrl: game.cover_image_url, gameName: game.name, gameReleased: game.released, timesPlayed: timesPlayed, gameDeveloper: developerMap.get(String(game.id)) ?? "", completedAllAchievements })
    }

    const unmatchedCount = steamGamesData.games.length - ngPlusGamesData.length

    return (
        <main>
            <div className="w-full mx-auto max-w-6xl items-center justify-items-center">
                <h2 className="text-center text-5xl mb-6 font-bold">Games From Steam ({steamGamesData.game_count ?? 0})</h2>
                <p className="text-center text-xl font-semibold my-2">Your Steam library has been imported. Your existing ScreenPeak library will not be affected.
                    All games already in your ScreenPeak library that were also imported from Steam are at the bottom of this list. All games will be imported by default, you can click a game if you do not wish to import it.
                    You may adjust relevant settings for each game before confirming the import.</p>
                {unmatchedCount > 0 && (
                    <p className="text-center text-sm text-(--color-muted)">{unmatchedCount} game{unmatchedCount === 1 ? "" : "s"} in your Steam library couldn&apos;t be matched to our catalog and won&apos;t appear below.</p>
                )}
                <SteamLinkGamesSection steamLinkEntries={steamLinkEntries} />
            </div>
        </main>
    )
}