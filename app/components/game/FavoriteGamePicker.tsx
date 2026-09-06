"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase-browser"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Game } from "@/types"
import Modal from "@/app/components/util/Modal"
import EditTriggerButton from "@/app/components/util/EditTriggerButton"
import { searchGamesByName } from "@/lib/queries/game"
import { updateFavoriteGames } from "@/lib/queries/user"
import { plus1 } from "@/lib/plus1"

export default function FavoriteGamePicker({ userId, currentGames } : { userId: string, currentGames: Game[]}) {
    const [searchQuery, setSearchQuery] = useState('')
    const [results, setResults] = useState<Game[]>([])
    const [isGamePickerModalOpen, setIsGamePickerModalOpen] = useState(false)
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
        // if/else, not two ifs — otherwise deselecting a game when the list is
        // under 5 immediately re-adds it via the second check.
        if (selectedGames.find(g => g.id === game.id)) {
            setSelectedGames(selectedGames.filter(g => g.id !== game.id))
        } else if (selectedGames.length < 5) {
            setSelectedGames([game, ...selectedGames])
        }
    }

    async function submitGames() {
        setError("")
        const supabase = createClient()
        const addedNew = selectedGames.some(g => !currentGames.find(c => c.id === g.id))
        const { error: writeError } = await updateFavoriteGames(supabase, userId, selectedGames.map(g => g.id))

        if (writeError) {
            setError(writeError)
            return
        }

        setIsGamePickerModalOpen(false)
        // +1 only when a game was newly pinned, not on reorder/removal
        if (addedNew) plus1("FAVORITED")
        router.refresh()
    }

    const gameIds = selectedGames.map(g => g.id)

    return (
        <div className="self-center">
            <EditTriggerButton onClick={() => setIsGamePickerModalOpen(true)} />
            {isGamePickerModalOpen && (
                <Modal
                    onClose={() => setIsGamePickerModalOpen(false)}
                    title="Choose Favorite Games"
                    titleClassName="font-semibold text-3xl mb-2 self-center"
                    panelClassName="w-full max-w-xl max-h-[75vh] p-8"
                >
                        <p className="text-center text-md mb-4">You can only select 5 favorite games. Choose wisely.</p>
                        {error && (
                            <p className="text-center text-sm font-semibold text-(--color-bad) mb-2">{error}</p>
                        )}
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
    )
}