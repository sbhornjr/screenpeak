"use client"

import { SteamImportBatch, SteamLinkEntry } from "@screenpeak/shared/types";
import GameFromSteam from "../game/GameFromSteam";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { importSteamLibraryEntries } from "@/app/library-actions";
import { resolveSteamImportBatch } from "@/app/steam-actions";

function mergeEntries(previous: SteamLinkEntry[], incoming: SteamLinkEntry[], edited: Set<string>) {
    const prior = new Map(previous.map(entry => [entry.gameId, entry]))
    return incoming.map(entry => {
        const saved = prior.get(entry.gameId)
        if (saved && edited.has(entry.gameId)) return saved
        if (!saved) return entry
        return { ...entry, completedAllAchievements: saved.completedAllAchievements || entry.completedAllAchievements }
    })
}

export default function SteamLinkGamesSection({
    initialEntries, totalApps, pending, unmatched, ambiguous,
}: {
    initialEntries: SteamLinkEntry[]
    totalApps: number
    pending: number
    unmatched: number
    ambiguous: number
}) {
    const [entries, setEntries] = useState(initialEntries)
    const [isImporting, setIsImporting] = useState(false)
    const [matching, setMatching] = useState(pending > 0)
    const [error, setError] = useState<string | null>(null)
    const [unmatchedCount, setUnmatchedCount] = useState(unmatched)
    const [ambiguousCount, setAmbiguousCount] = useState(ambiguous)
    const [retryableCount, setRetryableCount] = useState(0)
    const [remaining, setRemaining] = useState(pending)
    const [matchedGameCount, setMatchedGameCount] = useState(initialEntries.length)
    const [cycle, setCycle] = useState(0)
    const edited = useRef(new Set<string>())
    const router = useRouter()

    function updateLinkEntry(gameId: string, linkEntry: SteamLinkEntry) {
        edited.current.add(gameId)
        setEntries(prev => prev.map(entry => entry.gameId === gameId ? linkEntry : entry))
    }

    useEffect(() => {
        if (cycle === 0 && pending === 0) return
        let cancelled = false
        const retry = cycle > 0
        async function run() {
            let previousRemaining = Number.POSITIVE_INFINITY
            setMatching(true)
            setError(null)
            while (!cancelled) {
                let result: SteamImportBatch | { error: string }
                try {
                    result = await resolveSteamImportBatch(retry ? { retry: true } : {})
                } catch {
                    if (!cancelled) {
                        setError("Matching is unavailable. Your matched games are still listed.")
                        setMatching(false)
                    }
                    return
                }
                if (cancelled) return
                if ("error" in result) {
                    setError(result.error)
                    setMatching(false)
                    return
                }
                setEntries(prev => mergeEntries(prev, result.entries, edited.current))
                setUnmatchedCount(result.unmatchedAppCount)
                setAmbiguousCount(result.ambiguousAppCount)
                setRetryableCount(result.retryableAppCount)
                setRemaining(result.remaining)
                setMatchedGameCount(result.matchedGameCount)
                if (result.retryableAppCount > 0 || result.remaining === 0 || result.remaining >= previousRemaining) {
                    setMatching(false)
                    return
                }
                previousRemaining = result.remaining
            }
        }
        void run()
        return () => { cancelled = true }
    }, [cycle, pending])

    async function importGames() {
        setIsImporting(true)
        setError(null)
        try {
            const result = await importSteamLibraryEntries(entries.filter(entry => entry.selected))
            if (result.error) {
                setError(result.error)
                setIsImporting(false)
                return
            }
            router.push("/settings")
        } catch {
            setError("Something went wrong importing your games. Please try again.")
            setIsImporting(false)
        }
    }

    const selectedCount = entries.filter(entry => entry.selected).length
    const appLabel = (count: number) => `${count} Steam ${count === 1 ? "app" : "apps"}`

    return (
        <div className="flex flex-col gap-4">
            <p role="status" className="text-center text-sm text-(--color-muted)">
                {matching
                    ? `Matching your library… ${matchedGameCount} ${matchedGameCount === 1 ? "game" : "games"} ready, ${remaining} still to check.`
                    : `${matchedGameCount} ${matchedGameCount === 1 ? "game" : "games"} ready from ${totalApps} Steam ${totalApps === 1 ? "app" : "apps"}.`}
                {unmatchedCount > 0 ? ` ${appLabel(unmatchedCount)} could not be matched.` : ""}
                {ambiguousCount > 0 ? ` ${appLabel(ambiguousCount)} matched more than one game and were skipped.` : ""}
            </p>
            {retryableCount > 0 && !matching && (
                <button
                    type="button"
                    onClick={() => setCycle(value => value + 1)}
                    className="self-center px-4 py-1 text-sm border border-(--color-accent) text-(--color-accent) rounded-[3px]
                        hover:bg-(--color-accent) hover:text-(--color-bg) transition-colors duration-200"
                >
                    Try the remaining matches again
                </button>
            )}
            {entries.map(linkEntry => (
                <GameFromSteam key={linkEntry.gameId} gameId={linkEntry.gameId} linkEntry={linkEntry} onUpdate={updateLinkEntry} />
            ))}
            {error && <p className="text-center text-sm text-(--color-bad)">{error}</p>}
            <button
                onClick={() => importGames()}
                disabled={isImporting || selectedCount === 0}
                className="px-4 py-1 text-md bg-(--color-accent) text-(--color-bg) font-semibold rounded-[3px]
                    hover:bg-(--color-accent-hover) transition-colors duration-200
                    disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-(--color-accent)"
            >
                {isImporting ? "Importing…" : `Import Games (${selectedCount})`}
            </button>
        </div>
    )
}
