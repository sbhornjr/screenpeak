"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase-browser"
import { logger } from "@/lib/logger"

// Owner-only controls for the Read-out: generate/regenerate (POST /api/loadout,
// no body — the route identifies the user by session) and save-to-bio. The two
// buttons share a row; any error renders on its own full-width line below them.
export default function LoadoutActions({ userId, identity }: { userId: string, identity: string }) {
    const router = useRouter()
    const [generating, setGenerating] = useState(false)
    const [savedBio, setSavedBio] = useState(false)
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
        const supabase = await createClient()
        const { error: saveError } = await supabase
            .from("users")
            .update({ profile_loadout_bio: identity })
            .eq("id", userId)

        if (saveError) setError("Couldn't save to profile.")
        else setSavedBio(true)
    }

    const btn =
        "px-6 py-2 rounded-[3px] text-sm font-semibold font-(family-name:--font-display) " +
        "bg-(--color-accent) text-(--color-bg) hover:bg-(--color-accent-hover) " +
        "transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"

    return (
        <div className="mt-4 flex flex-col items-end gap-2">
            <div className="flex flex-wrap justify-end gap-3">
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
        </div>
    )
}
