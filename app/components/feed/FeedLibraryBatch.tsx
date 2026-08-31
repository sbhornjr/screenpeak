"use client"

import CoverFan from "@/app/components/lists/CoverFan"

export default function FeedLibraryBatch({ gameCoverImageUrls } : { gameCoverImageUrls: string[] | null }) {
    return (
        <div>
            {gameCoverImageUrls && gameCoverImageUrls.length > 0 && (
                <CoverFan covers={gameCoverImageUrls.slice(0, 5).map((url, i) => ({ key: String(i), src: url }))} />
            )}
        </div>
    )
}