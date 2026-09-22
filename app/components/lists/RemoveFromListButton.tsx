"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { removeGameFromListAction } from "@/app/list-actions"

export default function RemoveFromListButton({ listId, gameId } : { listId: string, gameId: string }) {
    const [error, setError] = useState("")
    const router = useRouter()

    async function removeGame() {
        setError("")
        const { error: removeError } = await removeGameFromListAction(listId, gameId)
        if (removeError) {
            setError(removeError)
            return
        }
        router.refresh()
    }

    return (
        <div className="flex flex-col items-center gap-0.5">
            <button
                className="text-xs text-(--color-muted) hover:text-(--color-bad)
                    transition-colors duration-200 text-center py-1"
                onClick={() => removeGame()}
            >
                Remove
            </button>
            {error && <p className="text-[0.65rem] text-(--color-bad)">{error}</p>}
        </div>
    )
}