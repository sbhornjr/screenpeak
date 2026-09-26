"use client"

import { useState } from "react"
import { useUser } from "../user/UserContext"
import AuthModal from "@/app/components/user/AuthModal"
import CreateListFromGamePageButton from "./CreateListFromGamePageButton"
import Modal from "@/app/components/util/Modal"
import { toggleGameInList } from "@/app/list-actions"
import { plus1 } from "@/lib/plus1"
import { Check } from "lucide-react"

export default function AddToListButton({ gameId, lists, listIdsGameIsIn, defaultListPrivacy } :
    { gameId : string, lists : { listId: string, listName: string }[], listIdsGameIsIn: Set<string>, defaultListPrivacy?: boolean }) {
    const [isAddToListModalOpen, setIsAddToListModalOpen] = useState(false)
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
    const [listIdsGameIsInState, setListIdsGameIsInState] = useState(new Set(listIdsGameIsIn))
    const [error, setError] = useState("")
    const { user } = useUser()

    async function handleListToggle(listId: string, alreadyInList: boolean) {
        setError("")

        const { error } = await toggleGameInList(listId, gameId, alreadyInList)
        if (error) { setError(error); return }

        if (alreadyInList) {
            setListIdsGameIsInState(prev => { prev.delete(listId); return new Set(prev) })
        } else {
            setListIdsGameIsInState(prev => new Set(prev).add(listId))
            plus1("LISTED")
            setIsAddToListModalOpen(false)
        }
    }

    return (
        <div>
            {user == null ? (
                <button className="px-4 py-1.5 rounded-[4px] font-mono text-[0.7rem] uppercase tracking-[0.14em] font-semibold border-2 border-(--color-accent) text-(--color-accent) hover:bg-(--color-accent) hover:text-(--color-bg) transition-colors duration-200
                    font-semibold rounded-[3px] hover:bg-(--color-accent) hover:text-(--color-bg) transition-colors duration-200"
                    onClick={() => setIsAuthModalOpen(true)}>
                    + List
                </button>
            ) : (
                <button className="px-4 py-1.5 rounded-[4px] font-mono text-[0.7rem] uppercase tracking-[0.14em] font-semibold border-2 border-(--color-accent) text-(--color-accent) hover:bg-(--color-accent) hover:text-(--color-bg) transition-colors duration-200
                    font-semibold rounded-[3px] hover:bg-(--color-accent) hover:text-(--color-bg) transition-colors duration-200"
                    onClick={() => setIsAddToListModalOpen(true)}>
                    + List
                </button>
            )}
            {isAuthModalOpen && (
                <AuthModal isOpen={true} defaultTab={"signin"} onClose={() => setIsAuthModalOpen(false)}></AuthModal>
            )}
            {isAddToListModalOpen && (
                <Modal
                    onClose={() => setIsAddToListModalOpen(false)}
                    title="Add to List"
                    titleClassName="font-semibold text-3xl mb-2 self-center"
                    panelClassName="w-full max-w-xl max-h-8/10 p-8"
                >
                    <div className="flex flex-col gap-4">
                        {lists.map(list => {
                            const alreadyInList = listIdsGameIsInState.has(list.listId)
                            return (
                                <button
                                    key={list.listId}
                                    onClick={() => handleListToggle(list.listId, alreadyInList)}
                                    className={`w-full flex items-center justify-between px-4 py-3 rounded-[3px]
                                        border transition-all duration-200 text-sm font-semibold
                                        ${alreadyInList
                                        ? 'border-(--color-accent) text-(--color-accent) bg-(--color-accent)/5'
                                        : 'border-(--color-border) text-(--color-text) hover:border-(--color-accent) hover:bg-(--color-accent)/5'}`}
                                >
                                    <span>{list.listName}</span>
                                    {alreadyInList && (
                                        <Check size={14} aria-hidden className="[stroke-width:2.5]" />
                                    )}
                                </button>
                            )
                        })}
                        {error && (
                            <p className="text-sm font-semibold text-(--color-bad) mb-2">{error}</p>
                        )}
                        {user && <CreateListFromGamePageButton gameId={gameId} close={() => setIsAddToListModalOpen(false)} defaultListPrivacy={defaultListPrivacy ?? true}/>}
                    </div>
                </Modal>
            )}
        </div>
    )
}