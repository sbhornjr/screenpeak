"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toggleBlock } from "@/app/user-actions"

/** Settings › Blocked users row action. Unblocking is reversible, so no confirm. */
export default function UnblockUserButton({ userId, username }: { userId: string, username: string }) {
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState(false)
    const router = useRouter()

    async function unblock() {
        setIsLoading(true)
        try {
            await toggleBlock(userId, true)
        } catch {
            setError(true)
            setIsLoading(false)
            return
        }

        setError(false)
        router.refresh()
    }

    return (
        <div className="flex items-center gap-3">
            {error && <p role="alert" className="text-sm font-semibold text-(--color-bad)">Failed to unblock.</p>}
            <button
                type="button"
                onClick={() => unblock()}
                disabled={isLoading}
                aria-label={`Unblock ${username}`}
                className="px-4 py-1.5 text-sm bg-transparent text-(--color-accent) border border-(--color-accent) font-semibold rounded-[3px] hover:bg-(--color-accent) hover:text-(--color-bg) transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
            >
                {isLoading ? "…" : "Unblock"}
            </button>
        </div>
    )
}
