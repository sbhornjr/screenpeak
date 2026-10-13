"use client"

import { SteamImportBatch, SteamImportCursor, SteamLinkEntry } from "@screenpeak/shared/types";
import GameFromSteam, { type SteamLinkEdit } from "../game/GameFromSteam";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { importSteamLibraryEntries } from "@/app/library-actions";
import { resolveSteamImportBatch } from "@/app/steam-actions";

function mergeEntries(previous: SteamLinkEntry[], incoming: SteamLinkEntry[], edited: Map<string, Set<SteamLinkEdit>>) {
    const prior = new Map(previous.map(entry => [entry.gameId, entry]))
    return incoming.map(entry => {
        const saved = prior.get(entry.gameId)
        const fields = edited.get(entry.gameId)
        if (!saved) return entry
        return {
            ...entry,
            playtimeSelected: fields?.has("hours") ? saved.playtimeSelected : entry.playtimeSelected,
            status: fields?.has("status") ? saved.status : entry.status,
            timesPlayed: fields?.has("times") ? saved.timesPlayed : entry.timesPlayed,
            selected: fields?.has("selected") ? saved.selected : entry.selected,
            completedAllAchievements: fields?.has("achievements")
                ? saved.completedAllAchievements
                : saved.completedAllAchievements || entry.completedAllAchievements,
        }
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
    const [notice, setNotice] = useState<string | null>(null)
    const edited = useRef(new Map<string, Set<SteamLinkEdit>>())
    const router = useRouter()

    function updateLinkEntry(gameId: string, linkEntry: SteamLinkEntry, field: SteamLinkEdit) {
        const fields = edited.current.get(gameId) ?? new Set<SteamLinkEdit>()
        fields.add(field)
        edited.current.set(gameId, fields)
        setEntries(prev => prev.map(entry => entry.gameId === gameId ? linkEntry : entry))
    }

    useEffect(() => {
        if (cycle === 0 && pending === 0) return
        let cancelled = false
        const retry = cycle > 0
        let cursor: SteamImportCursor | null = null
        async function run() {
            setMatching(true)
            setError(null)
            setNotice(null)
            while (!cancelled) {
                let result: SteamImportBatch | { error: string }
                try {
                    result = await resolveSteamImportBatch(retry ? { retry: true, cursor } : {})
                } catch {
                    if (!cancelled) {
                        setError("Matching is unavailable. Your matched games are still listed.")
                        setRetryableCount(count => count > 0 ? count : 1)
                        setMatching(false)
                    }
                    return
                }
                if (cancelled) return
                if ("error" in result) {
                    setError(result.error)
                    setRetryableCount(count => count > 0 ? count : 1)
                    setMatching(false)
                    return
                }
                if (result.notice) {
                    setNotice(result.notice)
                    setRetryableCount(result.retryableAppCount)
                    await new Promise(resolve => setTimeout(resolve, result.retryAfterMs ?? 5000))
                    if (cancelled) return
                    continue
                }
                setEntries(prev => mergeEntries(prev, result.entries, edited.current))
                setUnmatchedCount(result.unmatchedAppCount)
                setAmbiguousCount(result.ambiguousAppCount)
                setRemaining(result.remaining)
                setMatchedGameCount(result.matchedGameCount)
                setRetryableCount(result.retryableAppCount)
                setNotice(null)
                if (result.retryableAppCount > 0 || !result.nextCursor) {
                    setMatching(false)
                    return
                }
                cursor = result.nextCursor
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
                    : `${matchedGameCount} ${matchedGameCount === 1 ? "game" : "games"} ready from ${totalApps} Steam ${totalApps === 1 ? "app" : "apps"}.${remaining > 0 ? ` ${remaining} still to check.` : ""}`}
                {unmatchedCount > 0 ? ` ${appLabel(unmatchedCount)} could not be matched.` : ""}
                {ambiguousCount > 0 ? ` ${appLabel(ambiguousCount)} matched more than one game and were skipped.` : ""}
            </p>
            {notice && <p className="text-center text-sm text-(--color-bad)">{notice}</p>}
            {(notice || ((retryableCount > 0 || remaining > 0) && !matching)) && (
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
                disabled={isImporting || matching || selectedCount === 0}
                className="px-4 py-1 text-md bg-(--color-accent) text-(--color-bg) font-semibold rounded-[3px]
                    hover:bg-(--color-accent-hover) transition-colors duration-200
                    disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-(--color-accent)"
            >
                {isImporting ? "Importing…" : `Import Games (${selectedCount})`}
            </button>
        </div>
    )
}
