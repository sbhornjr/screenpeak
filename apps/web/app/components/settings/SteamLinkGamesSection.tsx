"use client"

import { SteamLinkEntry } from "@/types";
import GameFromSteam from "../game/GameFromSteam";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { importSteamLibraryEntries } from "@/app/library-actions";

export default function SteamLinkGamesSection({ steamLinkEntries } : { steamLinkEntries: Map<number, SteamLinkEntry>}) {
    const [entries, setEntries] = useState(steamLinkEntries)
    const [isImporting, setIsImporting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const router = useRouter()

    function updateLinkEntry(appid: number, linkEntry: SteamLinkEntry) {
        setEntries(prev => new Map(prev).set(appid, linkEntry))
    }

    async function importGames() {
        setIsImporting(true)
        setError(null)

        try {
            await importSteamLibraryEntries(Array.from(entries.values()).filter(sle => sle.selected))
            router.push("/settings")
        } catch {
            setError("Something went wrong importing your games. Please try again.")
            setIsImporting(false)
        }
    }

    return (
        <div className="flex flex-col gap-4">
            {Array.from(entries.entries()).map(([appid, linkEntry]) => (
                <GameFromSteam key={appid} appid={appid} linkEntry={linkEntry} onUpdate={updateLinkEntry} />
            ))}
            {error && <p className="text-center text-sm text-(--color-bad)">{error}</p>}
            <button
                onClick={() => importGames()}
                disabled={isImporting}
                className="px-4 py-1 text-md bg-(--color-accent) text-(--color-bg) font-semibold rounded-[3px]
                    hover:bg-(--color-accent-hover) transition-colors duration-200
                    disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-(--color-accent)"
            >
                {isImporting ? "Importing…" : `Import Games (${Array.from(entries.values()).filter(e => e.selected).length})`}
            </button>
        </div>
    )
}