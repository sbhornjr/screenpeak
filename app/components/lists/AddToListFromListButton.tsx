"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { createClient } from "@/lib/supabase-browser"
import { Game } from "@/types"
import Modal from "@/app/components/util/Modal"
import { searchGamesByName } from "@/lib/queries/game"
import { syncListGames } from "@/lib/queries/list"

export default function AddToListFromListButton({ listId, currentGames } : { listId: string, currentGames: Game[]}) {
    const [isAddToListModalOpen, setIsAddToListModalOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const [results, setResults] = useState<Game[]>([])
    const [selectedGames, setSelectedGames] = useState(currentGames)
    const [error, setError] = useState("")
    const router = useRouter()

    useEffect(() => {        
        const timer = setTimeout(async () => {
            if (!searchQuery.trim()) {
                setResults([])
                return
            }   

            const supabase = createClient()
            const data = await searchGamesByName(supabase, searchQuery)
            setResults(data)
        }, 300) // wait 300ms after user stops typing

        return () => clearTimeout(timer) // cancel if user types again before 300ms
    }, [searchQuery])  

    function gameSelected(game: Game) {
        if (selectedGames.find(g => g.id === game.id)) {
            setSelectedGames(selectedGames.filter(g => g.id !== game.id))
        } else {
            setSelectedGames([game, ...selectedGames])
        }
    }

    async function submitGames() {
        setError("")
        const supabase = createClient()

        const toRemove = currentGames.filter(g => !selectedGames.some(s => s.id === g.id))
        const toAdd = selectedGames.filter(g => !currentGames.some(c => c.id === g.id))

        const { error: syncError } = await syncListGames(supabase, listId, { toAdd, toRemove })
        if (syncError) {
            setError(syncError)
            return
        }

        setIsAddToListModalOpen(false)
        router.refresh()
    }

    const gameIds = selectedGames.map(g => g.id)
    
    return (
        <div>
            <div className="flex justify-end mb-4">
                <button className="px-4 py-2 rounded-[3px] text-sm font-semibold ml-auto
                    bg-(--color-accent) text-(--color-bg) hover:bg-(--color-accent-hover) transition-colors duration-200"
                    onClick={() => setIsAddToListModalOpen(true)}>
                    + Add Games
                </button>
                {isAddToListModalOpen && (
                    <Modal
                        onClose={() => setIsAddToListModalOpen(false)}
                        title="Manage List"
                        titleClassName="font-semibold text-3xl mb-2 self-center"
                        panelClassName="w-full max-w-xl max-h-8/10 p-8 gap-4"
                    >
            <div className="flex flex-row gap-2">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search games..."
                                    className="w-full px-6 py-2 pr-36 pl-5 rounded-[3px] text-base
                                        bg-(--color-surface) border border-(--color-border) text-(--color-text)
                                        placeholder-(--color-muted) outline-none
                                        focus:border-(--color-accent) focus:ring-1 focus:ring-(--color-accent)
                                        transition-all duration-200"
                                />
                                <button
                                    onClick={() => submitGames()}
                                    className="bg-(--color-accent) text-(--color-bg) hover:bg-(--color-accent-hover) self-center justify-self-center py-2 px-4 rounded-[3px] font-semibold transition-colors duration-200"
                                >
                                    Lock
                                </button>
                            </div>
                            {error && (
                                <p className="text-sm font-semibold text-(--color-bad) mt-2">{error}</p>
                            )}
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                                {results.map(game => 
                                    <button key={game.id} onClick={() => gameSelected(game)} className={`border border-(--color-muted) hover:border-(--color-accent) hover:bg-(--color-accent-hover) rounded-[3px] ${gameIds.find(g => g === game.id) && "border-(--color-accent) bg-(--color-accent-hover)"}`}>
                                        <div className="relative aspect-square w-full overflow-hidden">
                                            {game.cover_image_url ? (
                                                <Image
                                                    src={game.cover_image_url}
                                                    alt={game.name}
                                                    fill
                                                    className="object-cover transition-all duration-100 group-hover:scale-105"
                                                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-(--color-surface-light) flex items-center justify-center">
                                                    <span className="text-(--color-muted) text-sm">No image</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-3">
                                            <h3
                                                className="font-semibold text-md leading-tight text-(--color-text)
                                                group-hover:text-(--color-accent) transition-colors duration-200
                                                font-(family-name:--font-display) line-clamp-1"
                                            >
                                                {game.name}
                                            </h3>
                                            {game.released && (
                                                <p className="text-(--color-muted) text-sm mt-1">
                                                    {new Date(game.released).getFullYear()}
                                                </p>
                                            )}
                                            </div>
                                    </button>
                                )}
                            </div>
                    </Modal>
                )}
            </div>
        </div>
    )
}