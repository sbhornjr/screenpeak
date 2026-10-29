"use client"

import { useState } from "react"
import AuthModal from "@/app/components/user/AuthModal"
import { useUser } from "@/app/components/user/UserContext"
import { useRouter } from "next/navigation"
import Modal from "@/app/components/util/Modal"
import { submitRatingReview } from "@/app/review-actions"
import { plus1 } from "@/lib/plus1"
import { ratingLabel } from "@screenpeak/shared/rating-copy"

export default function RateReviewButton({ game_id, existing_rating_review } :
    { game_id: string, existing_rating_review: { rating: number, review: string | null, user_id: string, created_at: string | null, updated_at: string | null } | null | undefined}) {
    const { user } = useUser()
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
    const [isRateReviewModalOpen, setIsRateReviewModalOpen] = useState(false)
    const [existingRatingReview, setExistingRatingReview] = useState<{ rating: number, review: string | null, user_id: string, created_at: string | null, updated_at: string | null } | null | undefined>(existing_rating_review)
    const [rating, setRating] = useState(existingRatingReview ? existingRatingReview.rating : "6")
    const [label, setRatingLabel] = useState("")
    const [review, setReview] = useState(existingRatingReview?.review ?? "")
    const [error, setError] = useState("")
    const router = useRouter()

    function handleRatingChange(value: string) {
        setRating(value)
        setRatingLabel(ratingLabel(Number(value)))
    }

    async function handleSubmit() {
        if (!user) return

        setError("")
        const wasNew = !existingRatingReview

        const { data, error: writeError } = await submitRatingReview(game_id, rating, review, !wasNew)

        if (writeError) {
            setError(writeError)
            return
        }

        setExistingRatingReview(data)
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
                        <p className="text-md text-(--color-muted) text-center my-2">{label}</p>
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
                        {error && (
                            <p className="text-sm font-semibold text-(--color-bad) text-center mb-2">{error}</p>
                        )}
                        <button onClick={() => handleSubmit()} className="w-32 px-4 py-1 text-xl bg-(--color-accent) text-(--color-bg) font-semibold self-center rounded-[3px] transition-all duration-200 group-hover:bg-(--color-accent-hover)">
                            Submit
                        </button>
                </Modal>
            )}
        </div>
    )
}