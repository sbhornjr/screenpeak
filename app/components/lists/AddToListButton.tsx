"use client"

import { createClient } from "@/lib/supabase-browser"
import { useState } from "react"
import { useUser } from "../user/UserContext"
import AuthModal from "@/app/components/user/AuthModal"
import CreateListFromGamePageButton from "./CreateListFromGamePageButton"
import Modal from "@/app/components/util/Modal"
import { addGameToList, removeGameFromList } from "@/lib/queries/list"
import { plus1 } from "@/lib/plus1"

export default function AddToListButton({ gameId, lists, listIdsGameIsIn, defaultListPrivacy } : 
    { gameId : string, lists : { listId: string, listName: string, listCount: number }[], listIdsGameIsIn: Set<string>, defaultListPrivacy?: boolean }) {
    const [isAddToListModalOpen, setIsAddToListModalOpen] = useState(false)
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
    const [listIdsGameIsInState, setListIdsGameIsInState] = useState(new Set(listIdsGameIsIn))
    const [error, setError] = useState("")
    const { user } = useUser()

    async function handleListToggle(listId: string, alreadyInList: boolean) {
        setError("")
        const supabase = createClient()

        if (alreadyInList) {
            const { error: removeError } = await removeGameFromList(supabase, listId, gameId)
            if (removeError) { setError(removeError); return }
            setListIdsGameIsInState(prev => { prev.delete(listId); return new Set(prev) })
        } else {
            const { error: addError } = await addGameToList(supabase, listId, gameId)
            if (addError) { setError(addError); return }
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
                    panelClassName="w-full max-w-xl max-h-8/10 p-8 overflow-y-auto gap-4"
                >
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
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" strokeWidth="2.5"
                                        strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12"/>
                                        </svg>
                                    )}
                                </button>
                            )
                        })}
                        {error && (
                            <p className="text-sm font-semibold text-(--color-bad) mb-2">{error}</p>
                        )}
                        {user && <CreateListFromGamePageButton gameId={gameId} userId={user.id} close={() => setIsAddToListModalOpen(false)} defaultListPrivacy={defaultListPrivacy ?? true}/>}
                </Modal>
            )}
        </div>
    )
}