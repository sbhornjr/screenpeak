"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Modal from "@/app/components/util/Modal"
import EditTriggerButton from "@/app/components/util/EditTriggerButton"
import { saveBio } from "@/app/user-actions"

export default function BioButton({ currentBio } : { currentBio: string }) {
    const [bio, setBio] = useState(currentBio)
    const [isBioModalOpen, setIsBioModalOpen] = useState(false)
    const [error, setError] = useState("")
    const router = useRouter()

    async function submitBio() {
        setError("")
        const { error: writeError } = await saveBio(bio)

        if (writeError) {
            setError(writeError)
            return
        }

        setIsBioModalOpen(false)
        router.refresh()
    }

    return (
        <div className="self-center">
            <EditTriggerButton onClick={() => setIsBioModalOpen(true)} />
            {isBioModalOpen && (
                <Modal
                    onClose={() => setIsBioModalOpen(false)}
                    title="Bio"
                    titleClassName="font-semibold text-3xl mb-2 self-center"
                    panelClassName="w-full max-w-xl max-h-[75vh] p-8"
                >
                    <textarea
                        placeholder="Bio..."
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        rows={4}
                        className="w-full bg-(--color-surface) text-(--color-text) placeholder:text-(--color-muted)
                            border border-(--color-border) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:border-(--color-accent)
                            rounded-[3px] px-3 py-2 resize-none"
                    />
                    {error && (
                        <p className="mt-2 text-sm font-semibold text-(--color-bad)">{error}</p>
                    )}
                    <button onClick={() => submitBio()} className="mt-4 px-4 py-1 text-md bg-(--color-accent) text-(--color-bg) font-semibold rounded-[3px] hover:bg-(--color-accent-hover) transition-colors duration-200">
                        Submit Bio
                    </button>
                </Modal>
            )}
        </div>
    )
}