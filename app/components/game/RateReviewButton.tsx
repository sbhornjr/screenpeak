"use client"

import { useState } from "react"
import AuthModal from "@/app/components/user/AuthModal"
import { useUser } from "@/app/components/user/UserContext"
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from "next/navigation"
import Modal from "@/app/components/util/Modal"
import { createRatingReview, updateRatingReview } from "@/lib/queries/review"
import { plus1 } from "@/lib/plus1"

export default function RateReviewButton({ game_id, existing_rating_review } : 
    { game_id: string, existing_rating_review: { rating: number, review: string | null, user_id: string, created_at: string, updated_at: string } | null | undefined}) {
    const { user } = useUser()
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
    const [isRateReviewModalOpen, setIsRateReviewModalOpen] = useState(false)
    const [existingRatingReview, setExistingRatingReview] = useState<{ rating: number, review: string | null, user_id: string, created_at: string, updated_at: string } | null | undefined>(existing_rating_review)
    const [rating, setRating] = useState(existingRatingReview ? existingRatingReview.rating : "6")
    const [ratingLabel, setRatingLabel] = useState("")
    const [review, setReview] = useState(existingRatingReview?.review ?? "")
    const router = useRouter()

    function setLabel(value: string) {
        switch (value) {
            case "1":
                setRatingLabel("Might be the worst game I've ever played.")
                break
            case "2":
                setRatingLabel("It was really really bad.")
                break
            case "3":
                setRatingLabel("I didn't really like it.")
                break
            case "4":
                setRatingLabel("I couldn't get into it.")
                break
            case "5":
                setRatingLabel("Meh. It was fine.")
                break
            case "6":
                setRatingLabel("It was alright.")
                break
            case "7":
                setRatingLabel("Pretty solid game.")
                break
            case "8":
                setRatingLabel("This game was really good.")
                break
            case "9":
                setRatingLabel("Incredible game.")
                break
            case "10":
                setRatingLabel("Might be the best game I've ever played.")
                break
            default:
                setRatingLabel("This is definitely a bug.")
                break
        }
    }

    function handleRatingChange(value: string) {
        setRating(value)
        setLabel(value)
    }

    async function handleSubmit() {
        if (!user) return

        const supabase = createClient()

        const wasNew = !existingRatingReview

        if (existingRatingReview) {
            const data = await updateRatingReview(supabase, { userId: user.id, gameId: game_id, rating, review })
            setExistingRatingReview(data)
        }
        else {
            const data = await createRatingReview(supabase, { userId: user.id, gameId: game_id, rating, review })
            setExistingRatingReview(data)
        }

        setIsRateReviewModalOpen(false)
        // +1 fires only the first time you score a game, not on amendments
        if (wasNew) plus1("RATED")
        router.refresh()
    }

    return (
        <div className="mb-2">
            { user == null ? (
                <button onClick={() => setIsAuthModalOpen(true)} className="px-4 py-1.5 rounded-[4px] font-mono text-[0.7rem] uppercase tracking-[0.14em] font-semibold border-2 border-(--color-accent) text-(--color-accent) hover:bg-(--color-accent) hover:text-(--color-bg) transition-colors duration-200">
                    + Rate
                </button>
            ) : existingRatingReview == null ? (
                <button onClick={() => setIsRateReviewModalOpen(true)} className="px-4 py-1.5 rounded-[4px] font-mono text-[0.7rem] uppercase tracking-[0.14em] font-semibold border-2 border-(--color-accent) text-(--color-accent) hover:bg-(--color-accent) hover:text-(--color-bg) transition-colors duration-200">
                    + Rate
                </button>
            ) : <button onClick={() => setIsRateReviewModalOpen(true)} className="px-4 py-1.5 rounded-[4px] font-mono text-[0.7rem] uppercase tracking-[0.14em] font-semibold border-2 border-(--color-accent) text-(--color-accent) hover:bg-(--color-accent) hover:text-(--color-bg) transition-colors duration-200">
                    Amend
                </button>
            }
            {isAuthModalOpen && (
                <AuthModal isOpen={true} defaultTab={"signin"} onClose={() => setIsAuthModalOpen(false)}></AuthModal>
            )}
            {isRateReviewModalOpen && (
                <Modal onClose={() => setIsRateReviewModalOpen(false)} title={existingRatingReview ? "Update Rating and Review" : "Rate and Review"}>
                        <div className="flex gap-1 justify-center my-1">
                            {[1,2,3,4,5,6,7,8,9,10].map(n => (
                                <button
                                    key={n}
                                    onClick={() => handleRatingChange(String(n))}
                                    className={`w-8 h-8 rounded-[3px] text-sm font-bold transition-all duration-200
                                        ${Number(rating) === n 
                                        ? 'bg-(--color-accent) text-(--color-bg)' 
                                        : 'bg-(--color-surface-light) text-(--color-muted) hover:bg-(--color-border)'}`}
                                    >
                                    {n}
                                </button>
                            ))}
                        </div>
                        <p className="text-md text-(--color-muted) text-center my-2">{ratingLabel}</p>
                        <div className="flex flex-col gap-1 items-center mb-4">
                            <p className="self-start text-md text-(--color-muted)">Would you like to leave a review? (Optional)</p>
                            <textarea
                                placeholder="Leave a review..."
                                value={review}
                                onChange={(e) => setReview(e.target.value)}
                                rows={4}
                                className="w-full bg-(--color-surface) text-(--color-text) placeholder:text-(--color-muted) 
                                    border border-(--color-border) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:border-(--color-accent)
                                    rounded-[3px] px-3 py-2 resize-none"
                            />
                        </div>
                        <button onClick={() => handleSubmit()} className="w-32 px-4 py-1 text-xl bg-(--color-accent) text-(--color-bg) font-semibold self-center rounded-[3px] transition-all duration-200 group-hover:bg-(--color-accent-hover)">
                            Submit
                        </button>
                </Modal>
            )}
        </div>
    )
}