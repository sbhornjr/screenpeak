"use client"

import { createClient } from "@/lib/supabase-browser";
import { useState } from "react";
import { getTitles } from "@/lib/titles";
import { useRouter } from "next/navigation";
import Modal from "@/app/components/util/Modal";
import EditTriggerButton from "@/app/components/util/EditTriggerButton";
import { updateSelectedTitle } from "@/lib/queries/user";

export default function TitleSelectButton({ userId, currentTitle, topGames, topDevelopers } : { userId: string, currentTitle : string, topGames : string[], topDevelopers : string[] }) {
    const [isTitleSelectModalOpen, setIsTitleSelectModalOpen] = useState(false)
    const [selectedTitle, setSelectedTitle] = useState(currentTitle)
    const [error, setError] = useState("")
    const router = useRouter()

    async function handleTitleChange(title: string) {
        setError("")
        const supabase = createClient()
        const { title: newTitle, error: writeError } = await updateSelectedTitle(supabase, userId, title)

        if (writeError || !newTitle) {
            setError(writeError ?? "Couldn't update your title")
            return
        }

        setSelectedTitle(newTitle)
        setIsTitleSelectModalOpen(false)
        router.refresh()
    }

    return (
        <div className="mx-2">
            <EditTriggerButton onClick={() => setIsTitleSelectModalOpen(true)} />
            {isTitleSelectModalOpen &&
                <Modal
                    onClose={() => setIsTitleSelectModalOpen(false)}
                    title="Select Title"
                    panelClassName="w-full max-w-md max-h-8/10 p-8"
                >
                    {error && (
                        <p className="mb-3 text-sm font-semibold text-(--color-bad)">{error}</p>
                    )}
                    <div className="grid grid-cols-2 gap-4 items-center">
                        {getTitles({topGames, topDevelopers}).map(t =>
                            <button key={t} onClick={() => handleTitleChange(t)}
                                className={`w-full flex items-center gap-4 px-4 py-3 rounded-[3px]
                                    border border-(--color-border) hover:border-(--color-accent) hover:bg-(--color-accent)/5
                                    transition-all duration-200 group text-left
                                    ${selectedTitle === t && 'text-(--color-bg) bg-(--color-accent)'}`}>
                                <span className="text-xs text-(--color-muted)">{t}</span>
                            </button>
                        )}
                    </div>
                </Modal>
            }
        </div>
    )
}