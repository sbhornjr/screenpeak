"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase-browser"
import { useRouter } from "next/navigation"
import Modal from "@/app/components/util/Modal"
import { createList, updateList } from "@/lib/queries/list"
import { plus1 } from "@/lib/plus1"

export default function CreateListButton({ userId, type, current, defaultListPrivacy } : 
    { userId: string, type?: "create" | "update" | undefined, current?: { listId: string, name: string, description: string, isPublic: boolean, isPinned: boolean } | undefined, defaultListPrivacy?: boolean }) {
    const [name, setName] = useState(current ? current.name : "")
    const [description, setDescription] = useState(current ? current.description : "")
    const [isPinned, setIsPinned] = useState(current ? current.isPinned : false)
    const [isPublic, setIsPublic] = useState(current ? current.isPublic : defaultListPrivacy ?? true)
    const [isCreateListModalOpen, setIsCreateListModalOpen] = useState(false)
    const [error, setError] = useState("")
    const router = useRouter()
    const isUpdate = type && type === "update"

    async function submitList() {
        setError("")
        const supabase = createClient()
        const fields = { name, description, isPublic, isPinned }

        const { error: writeError } = isUpdate && current
            ? await updateList(supabase, current.listId, fields)
            : await createList(supabase, userId, fields)

        if (writeError) {
            setError(writeError)
            return
        }
        if (!isUpdate) plus1("NEW LIST")

        setIsCreateListModalOpen(false)
        router.refresh()
    }

    return (
        <div className="mb-4 self-center">
            <button onClick={() => setIsCreateListModalOpen(true)} className="px-4 py-1 text-md bg-(--color-accent) text-(--color-bg) font-semibold rounded-[3px] hover:bg-(--color-accent-hover) transition-colors duration-200">
                {isUpdate ? "Edit List" : "New List"}
            </button>
            {isCreateListModalOpen && (
                <Modal
                    onClose={() => setIsCreateListModalOpen(false)}
                    title={isUpdate ? "Edit List" : "Create a List"}
                    titleClassName="font-semibold text-3xl mb-2 self-center"
                    panelClassName="w-full max-w-xl max-h-8/10 p-8 gap-4"
                >
                    <form onSubmit={(e) => { e.preventDefault(); submitList() }} className="flex flex-col gap-4">
                        <div>
                            <h2 className="font-semibold text-md px-1">List Name</h2>
                            <input
                                type="text"
                                placeholder="List Name..."
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-(--color-surface) text-(--color-text) placeholder:text-(--color-muted) self-center justify-self-center border border-(--color-border) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:border-(--color-accent) rounded-[3px] px-2 py-1"
                            />
                        </div>
                        <div>
                            <h2 className="font-semibold text-md px-1">Description (Optional)</h2>
                            <textarea
                                placeholder="Description..."
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={4}
                                className="w-full bg-(--color-surface) text-(--color-text) placeholder:text-(--color-muted) 
                                    border border-(--color-border) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:border-(--color-accent)
                                    rounded-[3px] px-3 py-2 resize-none"
                            />
                        </div>
                        <div className="flex flex-col gap-3">
                            {[
                                { label: 'Public', value: isPublic, setter: setIsPublic },
                                { label: 'Pinned', value: isPinned, setter: setIsPinned },
                            ].map(({ label, value, setter }) => (
                                <button
                                    key={label}
                                    type="button"
                                    onClick={() => setter(!value)}
                                    className="flex items-center gap-3 text-left"
                                >
                                    <div className={`w-5 h-5 rounded-[3px] border-2 flex items-center justify-center
                                        transition-all duration-200 shrink-0
                                        ${value 
                                        ? 'bg-(--color-accent) border-(--color-accent)' 
                                        : 'bg-transparent border-(--color-border) hover:border-(--color-accent)'}`}
                                    >
                                        {value && (
                                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                            <path d="M1 4L3.5 6.5L9 1" stroke="var(--color-bg)" strokeWidth="2" 
                                            strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                        )}
                                    </div>
                                    <span className="text-sm font-semibold text-(--color-text)">{label}</span>
                                </button>
                            ))}
                        </div>
                        {error && (
                            <p className="text-sm font-semibold text-(--color-bad)">{error}</p>
                        )}
                        <button type="submit" className="px-4 py-1 text-md bg-(--color-accent) text-(--color-bg) font-semibold rounded-[3px] hover:bg-(--color-accent-hover) transition-colors duration-200">
                            {isUpdate ? "Update List" : "Create List"}
                        </button>
                    </form>
                </Modal>
            )}
        </div>
    )
}