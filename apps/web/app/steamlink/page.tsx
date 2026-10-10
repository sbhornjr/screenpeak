import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOptionalUser } from "@/lib/auth";
import { getSteamAccount } from "@/lib/queries/steam";
import { getOwnedGames } from "@/lib/steam";
import { loadSteamImportPreview } from "@/lib/catalog/steam-import";
import SteamLinkGamesSection from "../components/settings/SteamLinkGamesSection";

export const metadata: Metadata = {
    title: "Import from Steam",
    robots: { index: false },
}

export default async function SteamLinkPage() {
    const viewer = await getOptionalUser()

    if (!viewer) redirect("/")

    const steamUser = await getSteamAccount(viewer.id)

    if (!steamUser || !steamUser.steam_id) redirect("/settings?steam_error=1")

    const steamGamesData = await getOwnedGames(steamUser.steam_id)
    if (!steamGamesData || !steamGamesData.games) redirect("/settings?steam_error=2")

    // Local matches only. Missing apps are resolved in bounded server-action
    // batches after this render, so a catalogue write never runs inside GET.
    const owned = steamGamesData.games.map(game => ({
        appid: game.appid,
        name: game.name ?? "",
        playtimeMinutes: game.playtime_forever ?? 0,
    }))
    const preview = await loadSteamImportPreview(viewer.id, steamUser.steam_id, owned)

    return (
        <main>
            <div className="w-full mx-auto max-w-6xl items-center justify-items-center">
                <h2 className="text-center text-5xl mb-6 font-bold">Games From Steam ({steamGamesData.game_count ?? owned.length})</h2>
                <p className="text-center text-xl font-semibold my-2">Match your Steam library, then choose what to add. Your existing ScreenPeak library is not changed until you confirm.
                    Games already in your ScreenPeak library are kept as you left them, including hours played. You can skip a game before confirming.</p>
                <SteamLinkGamesSection
                    initialEntries={preview.entries}
                    totalApps={preview.totalApps}
                    pending={preview.pending}
                    unmatched={preview.unmatched}
                    ambiguous={preview.ambiguous}
                />
            </div>
        </main>
    )
}
