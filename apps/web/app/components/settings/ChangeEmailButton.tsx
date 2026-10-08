"use client"

import { createClient } from "@/lib/supabase-browser";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/app/components/util/Modal";
import EditTriggerButton from "@/app/components/util/EditTriggerButton";
import { updateEmail } from "@/lib/queries/user-auth";

export default function ChangeEmailButton({ currentEmail } : { currentEmail: string }) {
    const [isChangeEmailModalOpen, setIsChangeEmailModalOpen] = useState(false)
    const [email, setEmail] = useState("")
    const [error, setError] = useState("")
    const router = useRouter()

    async function submitEmail() {
        setError("")
        const supabase = createClient()
        const writeError = await updateEmail(supabase, email)

        if (writeError) {
            setError(writeError)
            return
        }

        setIsChangeEmailModalOpen(false)
        router.refresh()
    }

    return (
        <div className="mx-2">
            <EditTriggerButton onClick={() => setIsChangeEmailModalOpen(true)} />
            {isChangeEmailModalOpen &&
                <Modal
                    onClose={() => setIsChangeEmailModalOpen(false)}
                    title="Change Email"
                    panelClassName="w-full max-w-md max-h-8/10 p-8"
                >
                    <form onSubmit={(e) => { e.preventDefault(); submitEmail() }}>
                        <p className="font-semibold text-lg text-(--color-muted)">Current Email: <span className="text-(--color-text)">{currentEmail}</span></p>
                        <div className="flex flex-col mt-4">
                            <p className="font-semibold text-lg text-(--color-muted)">New Email:</p>
                            <input
                                type="email"
                                placeholder="Email..."
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-(--color-surface) text-(--color-text) placeholder:text-(--color-muted) self-center justify-self-center border border-(--color-border) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:border-(--color-accent) rounded-[3px] px-2 py-1"
                            />
                        </div>
                        {error && (
                            <p className="mt-2 text-sm font-semibold text-(--color-bad)">{error}</p>
                        )}
                        <button type="submit" className="px-4 py-1 mt-4 text-md bg-(--color-accent) text-(--color-bg) font-semibold rounded-[3px] hover:bg-(--color-accent-hover) transition-colors duration-200">
                            Submit
                        </button>
                    </form>
                </Modal>
            }
        </div>
    )
}
