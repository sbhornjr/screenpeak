"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Ban } from "lucide-react"
import Modal from "@/app/components/util/Modal"
import { toggleBlock } from "@/app/user-actions"

/**
 * Profile-page block control. Blocking asks first (it also drops any follow
 * between the two of you, both ways); unblocking is reversible and doesn't.
 */
export default function BlockButton({ targetUserId, username, initialIsBlocked }: {
    targetUserId: string
    username: string
    initialIsBlocked: boolean
}) {
    const [isBlocked, setIsBlocked] = useState(initialIsBlocked)
    const [isConfirmOpen, setIsConfirmOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState(false)
    const router = useRouter()

    async function toggle() {
        setIsLoading(true)
        try {
            await toggleBlock(targetUserId, isBlocked)
        } catch {
            setError(true)
            setIsLoading(false)
            return
        }

        setError(false)
        setIsBlocked(!isBlocked)
        setIsConfirmOpen(false)
        setIsLoading(false)
        router.refresh()
    }

    function closeConfirm() {
        setIsConfirmOpen(false)
        setError(false)
    }

    const label = isBlocked ? `Unblock ${username}` : `Block ${username}`

    return (
        <>
            <button
                type="button"
                onClick={() => isBlocked ? toggle() : setIsConfirmOpen(true)}
                disabled={isLoading}
                title={isBlocked ? "Unblock" : "Block"}
                aria-label={label}
                aria-pressed={isBlocked}
                className={`grid place-items-center size-7 rounded-[3px] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) disabled:opacity-60
                    ${isBlocked ? "text-(--color-bad) hover:text-(--color-muted)" : "text-(--color-muted) hover:text-(--color-bad)"}`}
            >
                <Ban size={14} aria-hidden />
            </button>
            {error && !isConfirmOpen && (
                <p role="alert" className="text-sm font-semibold text-(--color-bad)">Failed to unblock. Please try again.</p>
            )}
            {isConfirmOpen &&
                <Modal
                    onClose={closeConfirm}
                    title={`Block ${username}?`}
                    panelClassName="w-full max-w-md max-h-8/10 p-8"
                >
                    <p className="font-semibold text-lg text-(--color-muted)">
                        You&apos;ll stop following each other, and neither of you can follow the other while the block is on. You can unblock them any time from Settings.
                    </p>
                    {error && (
                        <p role="alert" className="font-semibold text-sm text-(--color-bad) mt-2">Failed to block. Please try again.</p>
                    )}
                    <button
                        type="button"
                        onClick={() => toggle()}
                        disabled={isLoading}
                        className="px-4 py-1 mt-4 text-md bg-(--color-bad) text-(--color-bg) font-semibold rounded-[3px] hover:bg-(--color-bad-hover) transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {isLoading ? "Blocking…" : "Block"}
                    </button>
                </Modal>
            }
        </>
    )
}
