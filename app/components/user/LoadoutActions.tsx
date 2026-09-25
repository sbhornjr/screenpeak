"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { logger } from "@/lib/logger"
import { saveLoadoutBio, clearLoadout } from "@/app/user-actions"
import Modal from "@/app/components/util/Modal"

// Owner-only controls for the Read-out: generate/regenerate (POST /api/loadout,
// no body — the route identifies the user by session), save-to-bio, and clear
// (removes the Read-out and any saved profile-bio copy of it — the self-serve
// opt-out path for the AI disclosure, alongside simply never clicking generate).
// The buttons share a row; any error renders on its own full-width line below them.
export default function LoadoutActions({ identity }: { identity: string }) {
    const router = useRouter()
    const [generating, setGenerating] = useState(false)
    const [savedBio, setSavedBio] = useState(false)
    const [clearing, setClearing] = useState(false)
    const [confirmingClear, setConfirmingClear] = useState(false)
    const [error, setError] = useState("")

    async function generate() {
        setGenerating(true)
        setError("")
        try {
            const res = await fetch("/api/loadout", { method: "POST" })
            if (res.ok) {
                setSavedBio(false)
                router.refresh()
            } else {
                const body = await res.json().catch(() => null)
                logger.error("loadout-identity", "Generation request failed", {
                    status: res.status,
                    error: body?.error,
                })
                if (res.status === 401) setError("You need to be logged in.")
                else if (res.status === 429) setError("Just generated one — wait a minute and try again.")
                else if (res.status === 400) setError("Rate at least 5 games first.")
                else setError("Couldn't generate right now. Try again shortly.")
            }
        } catch {
            setError("Network error — try again shortly.")
        } finally {
            setGenerating(false)
        }
    }

    async function saveBio() {
        const { error: saveError } = await saveLoadoutBio(identity)

        if (saveError) setError("Couldn't save to profile.")
        else setSavedBio(true)
    }

    async function confirmClear() {
        setClearing(true)
        setError("")
        const { error: clearError } = await clearLoadout()
        setClearing(false)
        if (clearError) {
            setError("Couldn't clear your Read-out.")
            return
        }
        setConfirmingClear(false)
        setSavedBio(false)
        router.refresh()
    }

    const btn =
        "px-6 py-2 rounded-[3px] text-sm font-semibold font-(family-name:--font-display) " +
        "bg-(--color-accent) text-(--color-bg) hover:bg-(--color-accent-hover) " +
        "transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"

    return (
        <div className="mt-4 flex flex-col items-end gap-2">
            <div className="flex flex-wrap justify-end gap-3">
                {identity && (
                    <button
                        type="button"
                        className="text-xs text-(--color-muted) hover:text-(--color-bad) underline transition-colors duration-200 self-center"
                        onClick={() => setConfirmingClear(true)}
                    >
                        Clear my Read-out
                    </button>
                )}
                {identity && (
                    <button type="button" className={btn} onClick={saveBio} disabled={savedBio}>
                        {savedBio ? "Bio Saved" : "Save to Profile"}
                    </button>
                )}
                <button type="button" className={btn} onClick={generate} disabled={generating}>
                    {generating ? "Generating…" : identity ? "Regenerate" : "Generate your Read-out"}
                </button>
            </div>
            {error && <p className="text-right text-xs text-(--color-bad)">{error}</p>}

            {confirmingClear && (
                <Modal onClose={() => setConfirmingClear(false)} title="Clear your Read-out?" panelClassName="w-full max-w-md p-8">
                    <p className="text-(--color-muted)">
                        This removes your generated Read-out and any saved copy of it on your profile.
                        You can generate a new one anytime — this isn&apos;t permanent, just gone until
                        you choose to make another.
                    </p>
                    <div className="mt-4 flex justify-end gap-3">
                        <button
                            type="button"
                            className="px-4 py-1.5 text-sm text-(--color-muted) hover:text-(--color-text) transition-colors duration-200"
                            onClick={() => setConfirmingClear(false)}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="px-4 py-1.5 text-sm font-semibold rounded-[3px] bg-(--color-bad) text-(--color-bg) hover:bg-(--color-bad-hover) transition-colors duration-200 disabled:opacity-60"
                            onClick={confirmClear}
                            disabled={clearing}
                        >
                            {clearing ? "Clearing…" : "Clear it"}
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    )
}
