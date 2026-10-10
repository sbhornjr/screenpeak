"use client"

import { useEffect, useRef, useState } from "react"
import { SteamLinkEntry } from "@screenpeak/shared/types"

export type SteamLinkEdit = "hours" | "status" | "times" | "achievements" | "selected"
import Image from "next/image"
import FilterSelect from "../util/FilterSelect"
import { displayCoverUrl } from "@/lib/catalog/images"
import { Check } from "lucide-react"

export default function GameFromSteam({ gameId, linkEntry, onUpdate } : { gameId: string, linkEntry: SteamLinkEntry, onUpdate: (gameId: string, linkEntry: SteamLinkEntry, field: SteamLinkEdit) => void }) {
    const [status, setStatus] = useState(linkEntry.status)
    const [playTime, setPlayTime] = useState(linkEntry.playtimeSelected)
    const [selected, setSelected] = useState(linkEntry.selected)
    const [timesPlayed, setTimesPlayed] = useState(linkEntry.timesPlayed ?? 1)
    const [completedAllAchievements, setCompletedAllAchievements] = useState(linkEntry.completedAllAchievements)
    const [entry, setEntry] = useState(linkEntry)
    const dirty = useRef(new Set<SteamLinkEdit>())

    useEffect(() => {
        const hours = dirty.current.has("hours") ? undefined : linkEntry.playtimeSelected
        const nextStatus = dirty.current.has("status") ? undefined : linkEntry.status
        const nextSelected = dirty.current.has("selected") ? undefined : linkEntry.selected
        const nextTimes = dirty.current.has("times") ? undefined : (linkEntry.timesPlayed ?? 1)
        const nextAchievements = dirty.current.has("achievements") ? undefined : linkEntry.completedAllAchievements
        if (hours !== undefined) setPlayTime(hours)
        if (nextStatus !== undefined) setStatus(nextStatus)
        if (nextSelected !== undefined) setSelected(nextSelected)
        if (nextTimes !== undefined) setTimesPlayed(nextTimes)
        if (nextAchievements !== undefined) setCompletedAllAchievements(nextAchievements)
        setEntry(current => ({
            ...linkEntry,
            playtimeSelected: hours ?? current.playtimeSelected,
            status: nextStatus ?? current.status,
            selected: nextSelected ?? current.selected,
            timesPlayed: nextTimes ?? current.timesPlayed,
            completedAllAchievements: nextAchievements ?? current.completedAllAchievements,
        }))
    }, [linkEntry])

    function updateSelected(newSelected: boolean) {
        dirty.current.add("selected")
        setSelected(newSelected)
        const newLinkEntry = { ...entry, selected: newSelected }
        setEntry(newLinkEntry)
        onUpdate(gameId, newLinkEntry, "selected")
    }

    function updateStatus(newStatus: string) {
        dirty.current.add("status")
        setStatus(newStatus)
        const newLinkEntry = { ...entry, status: newStatus }
        setEntry(newLinkEntry)
        onUpdate(gameId, newLinkEntry, "status")
    }

    function updatePlayTime(newPlayTime: number) {
        dirty.current.add("hours")
        setPlayTime(newPlayTime)
        const newLinkEntry = { ...entry, playtimeSelected: newPlayTime }
        setEntry(newLinkEntry)
        onUpdate(gameId, newLinkEntry, "hours")
    }

    function updateTimesPlayed(newTimesPlayed: number) {
        dirty.current.add("times")
        setTimesPlayed(newTimesPlayed)
        const newLinkEntry = { ...entry, timesPlayed: newTimesPlayed }
        setEntry(newLinkEntry)
        onUpdate(gameId, newLinkEntry, "times")
    }

    function updateCompletedAllAchievements(newCompletedAllAchievements: boolean) {
        dirty.current.add("achievements")
        setCompletedAllAchievements(newCompletedAllAchievements)
        const newLinkEntry = { ...entry, completedAllAchievements: newCompletedAllAchievements }
        setEntry(newLinkEntry)
        onUpdate(gameId, newLinkEntry, "achievements")
    }

    const cover = displayCoverUrl(linkEntry.coverImageUrl, 'small')

    return (
        <div className={`relative border-2 rounded-[3px] p-4 ${selected ? "border-(--color-accent)/50" : "border-(--color-border)"}`}>
            <button
                onClick={() => updateSelected(!selected)}
                aria-label={`${selected ? "Deselect" : "Select"} ${linkEntry.gameName}`}
                aria-pressed={selected}
                className="absolute inset-0 z-0 rounded-[3px]"
            />
            <div className="relative z-10 flex flex-wrap items-center gap-3 sm:gap-4 pointer-events-none">
                <div className="relative w-20 aspect-3/4 shrink-0 rounded-[3px] overflow-hidden">
                    {cover ? (
                        <Image
                            src={cover}
                            alt={linkEntry.gameName}
                            fill
                            className="object-cover grayscale-15 contrast-[1.05] transition-all duration-300 group-hover:grayscale-0"
                            sizes="80px"
                        />
                        ) : (
                        <div className="relative w-full h-full bg-(--color-surface-light) flex items-center justify-center overflow-hidden">
                            <div
                                className="absolute inset-0 opacity-[0.07]"
                                style={{ backgroundImage: 'repeating-linear-gradient(135deg, var(--color-muted) 0, var(--color-muted) 1px, transparent 1px, transparent 9px)' }}
                            />
                            <span className="relative text-(--color-muted) text-[9px] uppercase tracking-[0.2em] font-mono text-center px-1">
                                No Cover
                            </span>
                        </div>
                    )}
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <h3
                        className="font-medium text-[15px] leading-tight text-(--color-text)
                        group-hover:text-(--color-accent) transition-colors duration-200
                        font-(family-name:--font-display) line-clamp-1"
                    >
                        {linkEntry.gameName}
                    </h3>
                    <div className="flex items-center gap-2 min-w-0">
                        <p className="text-(--color-muted) text-xs font-(family-name:--font-body) line-clamp-1 min-w-0">
                            {linkEntry.gameDeveloper}
                        </p>
                        <span className="text-(--color-muted) text-xs shrink-0 font-mono">
                            { linkEntry.gameReleased ? new Date(linkEntry.gameReleased).getFullYear() : ""}
                        </span>
                    </div>
                </div>
                <div className="shrink-0 pointer-events-auto">
                    <FilterSelect value={status} onChange={e => updateStatus(e.target.value)}>
                        <option value="completed">Completed</option>
                        <option value="backlog">Backlog</option>
                        <option value="playing">Playing</option>
                        <option value="abandoned">Abandoned</option>
                    </FilterSelect>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                    <label htmlFor={`hours-${gameId}`} className="text-xs font-semibold text-(--color-muted) uppercase tracking-wider">
                        Hours Played
                    </label>
                    <div className="flex items-center gap-2 bg-(--color-surface) border border-(--color-border)
                        rounded-[3px] px-3 py-2 focus-within:border-(--color-accent) transition-colors duration-200 w-32 pointer-events-auto">
                        <input
                            id={`hours-${gameId}`}
                            type="number"
                            min="0"
                            max="99999"
                            step="0.5"
                            value={playTime}
                            onChange={e => updatePlayTime(Number(e.target.value))}
                            placeholder="0"
                            className="bg-transparent text-(--color-text) text-sm w-full outline-none
                                [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                                [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="text-xs text-(--color-muted) shrink-0">hrs</span>
                    </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                    <label className="text-xs font-semibold text-(--color-muted) uppercase tracking-wider">
                        Times Played
                    </label>
                    <div className="flex items-center border border-(--color-border) rounded-[3px]
                        overflow-hidden focus-within:border-(--color-accent) transition-colors duration-200 pointer-events-auto">
                        <button
                            type="button"
                            onClick={() => updateTimesPlayed(Math.max(1, (timesPlayed ?? 1) - 1))}
                            className="px-3 py-2 bg-(--color-surface-light) text-(--color-muted) hover:text-(--color-text)
                                hover:bg-(--color-border) transition-colors duration-200 text-sm font-bold"
                        >
                            −
                        </button>
                        <input
                            type="number"
                            min="1"
                            max="99"
                            value={timesPlayed ?? 1}
                            onChange={e => updateTimesPlayed(Math.max(1, Number(e.target.value)))}
                            className="bg-(--color-surface) text-(--color-text) text-sm text-center w-12 py-2 outline-none
                                [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                                [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                            type="button"
                            onClick={() => updateTimesPlayed((timesPlayed ?? 1) + 1)}
                            className="px-3 py-2 bg-(--color-surface-light) text-(--color-muted) hover:text-(--color-text)
                                hover:bg-(--color-border) transition-colors duration-200 text-sm font-bold"
                        >
                            +
                        </button>
                    </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0 items-center pointer-events-auto">
                    <label className="text-xs font-semibold text-(--color-muted) uppercase tracking-wider">
                        100%
                    </label>
                    <button
                        type="button"
                        onClick={() => updateCompletedAllAchievements(!completedAllAchievements)}
                        aria-pressed={completedAllAchievements}
                        aria-label={`${completedAllAchievements ? "Unmark" : "Mark"} ${linkEntry.gameName} as 100% Achievements Completed`}
                        className="flex items-center justify-center h-[38px]"
                    >
                        <div className={`w-5 h-5 rounded-[3px] border-2 flex items-center justify-center
                            transition-all duration-200 shrink-0
                            ${completedAllAchievements
                            ? 'bg-(--color-accent) border-(--color-accent)'
                            : 'bg-transparent border-(--color-border) hover:border-(--color-accent)'}`}
                        >
                            {completedAllAchievements && (
                                <Check size={12} aria-hidden className="text-(--color-bg) [stroke-width:2.5]" />
                            )}
                        </div>
                    </button>
                </div>
            </div>
        </div>
    )
}