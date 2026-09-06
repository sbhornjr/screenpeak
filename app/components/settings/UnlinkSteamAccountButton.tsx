"use client"

import { createClient } from "@/lib/supabase-browser";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/app/components/util/Modal";
import { unlinkSteamAccount } from "@/lib/queries/steam";

export default function UnlinkSteamAccountButton({ userId } : { userId: string }) {
    const [isUnlinkSteamAccountModalOpen, setIsUnlinkSteamAccountModalOpen] = useState(false)
    const [error, setError] = useState(false)
    const router = useRouter()

    async function unlinkAccount() {
        const supabase = createClient()

        try {
            await unlinkSteamAccount(supabase, userId)
        } catch {
            setError(true)
            return
        }

        setError(false)
        setIsUnlinkSteamAccountModalOpen(false)
        router.refresh()
    }

    return (
        <div>
            <button onClick={() => setIsUnlinkSteamAccountModalOpen(true)} className="px-4 py-1 text-md bg-(--color-bad) text-(--color-bg) font-semibold rounded-[3px] hover:bg-(--color-bad-hover) transition-colors duration-200">
                Unlink Steam Account
            </button>
            {isUnlinkSteamAccountModalOpen &&
                <Modal
                    onClose={() => setIsUnlinkSteamAccountModalOpen(false)}
                    title="Unlink Steam Account"
                    panelClassName="w-full max-w-md max-h-8/10 p-8"
                >
                    <p className="font-semibold text-lg text-(--color-muted)">This action will not affect your Library. Games that were originally imported via Steam will remain.</p>
                    {error && (
                        <p className="font-semibold text-sm text-(--color-bad) mt-2">Failed to unlink Steam account. Please try again.</p>
                    )}
                    <button onClick={() => unlinkAccount()} className="px-4 py-1 mt-4 text-md bg-(--color-bad-hover) text-(--color-bg) font-semibold rounded-[3px] hover:bg-(--color-accent-hover) transition-colors duration-200">
                        Unlink Steam Account
                    </button>
                </Modal>
            }
        </div>
    )
}
