'use client'

import { useState, useEffect } from "react"
import AuthModal from "@/app/components/user/AuthModal"
import { useUser } from "@/app/components/user/UserContext"
import { useRouter } from "next/navigation"
import Modal from "@/app/components/util/Modal"
import { addOrUpdateLibraryEntry, removeLibraryEntry, fetchLibraryEntry } from "@/app/library-actions"
import { plus1 } from "@/lib/plus1"
import { Check, Layers, Play, X } from "lucide-react"

export default function LibraryButton({ game_id }: { game_id: number }) {
    const { user } = useUser()
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
    const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false)
    const [libraryEntry, setLibraryEntry] = useState<{ id: string, status: string } | null>(null)
    const [currentStatus, setStatus] = useState<string>("")
    const [advancedOptionsOpen, setAdvancedOptionsOpen] = useState(false)
    const [is100, setIs100] = useState(false)
    const [hours, setHours] = useState<number | null>(null)
    const [playedCount, setPlayedCount] = useState(1)
    const router = useRouter()

    useEffect(() => {

        async function checkEntry() {
            if (!user) return

            try {
                const data = await fetchLibraryEntry(game_id)
                setLibraryEntry(data ?? null)
                setStatus(data?.status ?? "")
                setIs100(data?.completed_all_achievements ?? false)
                setHours(data?.hours_played != null ? Number(data.hours_played) : 0)
                setPlayedCount(data?.play_count ?? 1)
            } catch {
                // An outage is not "removed from your save". Keep the last entry.
            }
        }

        if (user) checkEntry()
    }, [user, game_id])

    async function addToLibrary() {
        if (!user) return

        const fields = { status: currentStatus, is100, hours, playedCount }

        const wasNew = !libraryEntry
        const prevStatus = libraryEntry?.status

        let data
        try {
            data = await addOrUpdateLibraryEntry(game_id, fields)
        } catch {
            return
        }

        setLibraryEntry(data)
        setStatus(data?.status ?? "")
        setIs100(data?.completed_all_achievements ?? false)
        setHours(data?.hours_played != null ? Number(data.hours_played) : 0)
        setPlayedCount(data?.play_count ?? 1)

        setIsLibraryModalOpen(false)

        // +1 fires on a new entry, or when an existing one first reaches "completed"
        if (wasNew) {
            plus1(data?.status === "completed" ? "COMPLETED" : "SAVED")
        } else if (data?.status === "completed" && prevStatus !== "completed") {
            plus1("COMPLETED")
        }

        router.refresh()
    }

    async function removeFromLibrary() {
        if (!user || !libraryEntry) return

        await removeLibraryEntry(libraryEntry.id)

        setLibraryEntry(null)
        setIsLibraryModalOpen(false)
        router.refresh()
    }

    return (
        <div>
            { user == null ? (
                <button onClick={() => setIsAuthModalOpen(true)} className="px-4 py-1.5 rounded-[4px] font-mono text-[0.7rem] uppercase tracking-[0.14em] font-semibold border-2 border-(--color-accent) text-(--color-accent) hover:bg-(--color-accent) hover:text-(--color-bg) transition-colors duration-200">
                    + Save Game
                </button>
            ) : libraryEntry == null ? (
                <button onClick={() => setIsLibraryModalOpen(true)} className="px-4 py-1.5 rounded-[4px] font-mono text-[0.7rem] uppercase tracking-[0.14em] font-semibold border-2 border-(--color-accent) text-(--color-accent) hover:bg-(--color-accent) hover:text-(--color-bg) transition-colors duration-200">
                    + Save Game
                </button>
            ) : <div className="group">
                    <button onClick={() => setIsLibraryModalOpen(true)} className="w-36 px-4 py-1.5 rounded-[4px] font-mono text-[0.7rem] uppercase tracking-[0.14em] font-semibold border-2 border-(--color-border) text-(--color-text) transition-colors duration-200 group-hover:border-(--color-bad) group-hover:text-(--color-bad)">
                        <span className="group-hover:hidden">
                            {libraryEntry.status.charAt(0).toUpperCase() + libraryEntry.status.slice(1)}
                        </span>
                        <span className="hidden group-hover:inline">
                            Manage
                        </span>
                    </button>
                </div>
            }
            {isAuthModalOpen && (
                <AuthModal isOpen={true} defaultTab={"signin"} onClose={() => setIsAuthModalOpen(false)}></AuthModal>
            )}
            {isLibraryModalOpen && (
                <Modal onClose={() => setIsLibraryModalOpen(false)} title={libraryEntry ? "Manage Game" : "Add to Library"}>
                        <div className="grid grid-cols-2 gap-4 items-center">
                        {[
                        { status: 'backlog', icon: Layers, label: 'Backlog', description: "I'll get to it..." },
                        { status: 'playing', icon: Play, label: 'Playing', description: 'Currently playing it' },
                        { status: 'completed', icon: Check, label: 'Completed', description: 'Done and satisfied' },
                        { status: 'abandoned', icon: X, label: 'Abandoned', description: "Couldn't get into it" },
                        ].map(({ status, icon: Icon, label, description }) => (
                        <button
                            key={status}
                            onClick={() => setStatus(status)}
                            className={`w-full flex items-center gap-4 px-4 py-3 rounded-[3px]
                            border border-(--color-border) hover:border-(--color-accent) hover:bg-(--color-accent)/5
                            transition-all duration-200 group text-left ${status === currentStatus && "border-(--color-accent) bg-(--color-accent)/5"}`}
                        >
                            <Icon size={20} aria-hidden className={`w-6 ${status === currentStatus ? "text-(--color-accent)" : "text-(--color-muted)"} group-hover:text-(--color-accent) transition-colors duration-200`} />
                            <div className="flex flex-col">
                            <span className="text-sm font-semibold text-(--color-text)
                                group-hover:text-(--color-accent) transition-colors duration-200
                                font-(family-name:--font-display)">
                                {label}
                            </span>
                            <span className="text-xs text-(--color-muted)">{description}</span>
                            </div>
                        </button>
                        ))}
                        </div>
                        <button onClick={() => addToLibrary()} className="w-full rounded-[3px] bg-(--color-accent) text-(--color-bg) border mt-3 my-2 py-4">
                            {libraryEntry ? "Update Library Entry" : "Add to Library"}
                        </button>
                        {libraryEntry &&
                            <button onClick={() => removeFromLibrary()} className="w-full rounded-[3px] bg-(--color-bad) text-(--color-text) border border-(--color-bad-hover) my-2 py-4">
                                Remove From Library
                            </button>
                        }
                        <button
                            onClick={() => setAdvancedOptionsOpen(!advancedOptionsOpen)}
                            className="self-center justify-self-center bg-(--color-surface) text-(--color-text) placeholder:text-(--color-muted) border border-(--color-border) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:border-(--color-accent) rounded-[3px] my-2 px-4 py-2 whitespace-nowrap"
                        >
                            {advancedOptionsOpen ? '- Advanced Options' : '+ Advanced Options'}
                        </button>
                        {advancedOptionsOpen && (
                            <div className="flex flex-wrap flex-row gap-4 mb-4 mt-2">
                                <button
                                    type="button"
                                    onClick={() => setIs100(!is100)}
                                    className="flex items-center gap-3 text-left"
                                >
                                    <div className={`w-5 h-5 rounded-[3px] border-2 flex items-center justify-center
                                        transition-all duration-200 shrink-0
                                        ${is100
                                        ? 'bg-(--color-accent) border-(--color-accent)'
                                        : 'bg-transparent border-(--color-border) hover:border-(--color-accent)'}`}
                                    >
                                        {is100 && (
                                            <Check size={12} aria-hidden className="text-(--color-bg) [stroke-width:2.5]" />
                                        )}
                                    </div>
                                    <span className="text-sm font-semibold text-(--color-text)">100% Achievements Completed</span>
                                </button>
                                <div className="flex gap-6 items-center justify-around w-full">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs font-semibold text-(--color-muted) uppercase tracking-wider">
                                            Hours Played
                                        </label>
                                        <div className="flex items-center gap-2 bg-(--color-surface) border border-(--color-border)
                                            rounded-[3px] px-3 py-2 focus-within:border-(--color-accent) transition-colors duration-200 w-32">
                                            <input
                                                type="number"
                                                min="0"
                                                max="99999"
                                                step="0.5"
                                                value={hours ?? ''}
                                                onChange={e => setHours(e.target.value === '' ? null : Number(e.target.value))}
                                                placeholder="0"
                                                className="bg-transparent text-(--color-text) text-sm w-full outline-none
                                                    [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                                                    [&::-webkit-inner-spin-button]:appearance-none"
                                            />
                                            <span className="text-xs text-(--color-muted) shrink-0">hrs</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs font-semibold text-(--color-muted) uppercase tracking-wider">
                                            Times Played
                                        </label>
                                        <div className="flex items-center border border-(--color-border) rounded-[3px]
                                            overflow-hidden focus-within:border-(--color-accent) transition-colors duration-200">
                                            <button
                                                type="button"
                                                onClick={() => setPlayedCount(Math.max(1, (playedCount ?? 1) - 1))}
                                                className="px-3 py-2 bg-(--color-surface-light) text-(--color-muted) hover:text-(--color-text)
                                                    hover:bg-(--color-border) transition-colors duration-200 text-sm font-bold"
                                            >
                                                −
                                            </button>
                                            <input
                                                type="number"
                                                min="1"
                                                max="99"
                                                value={playedCount ?? 1}
                                                onChange={e => setPlayedCount(Math.max(1, Number(e.target.value)))}
                                                className="bg-(--color-surface) text-(--color-text) text-sm text-center w-12 py-2 outline-none
                                                    [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                                                    [&::-webkit-inner-spin-button]:appearance-none"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setPlayedCount((playedCount ?? 1) + 1)}
                                                className="px-3 py-2 bg-(--color-surface-light) text-(--color-muted) hover:text-(--color-text)
                                                    hover:bg-(--color-border) transition-colors duration-200 text-sm font-bold"
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                </Modal>
            )}
        </div>
    )
}
