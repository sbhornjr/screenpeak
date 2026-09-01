"use client"

import { useState } from "react"
import { SteamLinkEntry } from "@/types"
import Image from "next/image"
import FilterSelect from "../util/FilterSelect"

export default function GameFromSteam({ appid, linkEntry, onUpdate } : { appid: number, linkEntry: SteamLinkEntry, onUpdate: (appid: number, linkEntry: SteamLinkEntry) => void }) {
    const [status, setStatus] = useState(linkEntry.status)
    const [playTime, setPlayTime] = useState(linkEntry.playtimeSelected)
    const [selected, setSelected] = useState(linkEntry.selected)
    const [timesPlayed, setTimesPlayed] = useState(linkEntry.timesPlayed ?? 1)
    const [completedAllAchievements, setCompletedAllAchievements] = useState(linkEntry.completedAllAchievements)
    const [entry, setEntry] = useState(linkEntry)

    function updateSelected(newSelected: boolean) {
        setSelected(newSelected)
        const newLinkEntry = { ...entry, selected: newSelected }
        setEntry(newLinkEntry)
        onUpdate(appid, newLinkEntry)
    }

    function updateStatus(newStatus: string) {
        setStatus(newStatus)
        const newLinkEntry = { ...entry, status: newStatus }
        setEntry(newLinkEntry)
        onUpdate(appid, newLinkEntry)
    }

    function updatePlayTime(newPlayTime: number) {
        setPlayTime(newPlayTime)
        const newLinkEntry = { ...entry, playtimeSelected: newPlayTime }
        setEntry(newLinkEntry)
        onUpdate(appid, newLinkEntry)
    }

    function updateTimesPlayed(newTimesPlayed: number) {
        setTimesPlayed(newTimesPlayed)
        const newLinkEntry = { ...entry, timesPlayed: newTimesPlayed }
        setEntry(newLinkEntry)
        onUpdate(appid, newLinkEntry)
    }

    function updateCompletedAllAchievements(newCompletedAllAchievements: boolean) {
        setCompletedAllAchievements(newCompletedAllAchievements)
        const newLinkEntry = { ...entry, completedAllAchievements: newCompletedAllAchievements }
        setEntry(newLinkEntry)
        onUpdate(appid, newLinkEntry)
    }

    return (
        <div className={`relative border-2 rounded-[3px] p-4 ${selected ? "border-(--color-accent)/50" : "border-(--color-border)"}`}>
            <button
                onClick={() => updateSelected(!selected)}
                aria-label={`${selected ? "Deselect" : "Select"} ${linkEntry.gameName}`}
                aria-pressed={selected}
                className="absolute inset-0 z-0 rounded-[3px]"
            />
            <div className="relative z-10 flex flex-wrap items-center gap-3 sm:gap-4 pointer-events-none">
                <div className="relative w-20 h-20 shrink-0 rounded-[3px] overflow-hidden">
                    {linkEntry.coverImageUrl ? (
                        <Image
                            src={linkEntry.coverImageUrl}
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
                    <label className="text-xs font-semibold text-(--color-muted) uppercase tracking-wider">
                        Hours Played
                    </label>
                    <div className="flex items-center gap-2 bg-(--color-surface) border border-(--color-border)
                        rounded-[3px] px-3 py-2 focus-within:border-(--color-accent) transition-colors duration-200 w-32 pointer-events-auto">
                        <input
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
                                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                    <path d="M1 4L3.5 6.5L9 1" stroke="var(--color-bg)" strokeWidth="2"
                                    strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            )}
                        </div>
                    </button>
                </div>
            </div>
        </div>
    )
}