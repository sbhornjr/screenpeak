"use client"

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/app/components/util/Modal";
import EditTriggerButton from "@/app/components/util/EditTriggerButton";
import { togglePrivacyAction } from "@/app/user-actions";

export default function ChangePrivacyButton({ currentPrivacy, type } : { currentPrivacy: boolean, type: string }) {
    const [isChangePrivacyModalOpen, setIsChangePrivacyModalOpen] = useState(false)
    const [error, setError] = useState("")
    const router = useRouter()

    async function togglePrivacy() {
        setError("")
        const writeError = await togglePrivacyAction(currentPrivacy, type)

        if (writeError) {
            setError(writeError)
            return
        }

        setIsChangePrivacyModalOpen(false)
        router.refresh()
    }

    return (
        <div className="mx-2">
            <EditTriggerButton onClick={() => setIsChangePrivacyModalOpen(true)} />
            {isChangePrivacyModalOpen &&
                <Modal
                    onClose={() => setIsChangePrivacyModalOpen(false)}
                    title={`${type} Privacy`}
                    panelClassName="w-full max-w-md max-h-8/10 p-8"
                >
                    <p className="font-semibold text-lg text-(--color-muted)">Current {type} Privacy: <span className="text-(--color-text)">{ currentPrivacy ? "Public" : "Private"}</span></p>
                    {error && (
                        <p className="font-semibold text-(--color-bad) mt-2">{error}</p>
                    )}
                    <button onClick={() => togglePrivacy()} className="px-4 py-1 mt-4 text-md bg-(--color-accent) text-(--color-bg) font-semibold rounded-[3px] hover:bg-(--color-accent-hover) transition-colors duration-200">
                        Toggle {type} Privacy
                    </button>
                </Modal>
            }
        </div>
    )
}
