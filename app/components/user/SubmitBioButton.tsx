"use client"

import { createClient } from "@/lib/supabase-browser"
import { useState } from "react"

export default function SubmitBioButton({ userId, bio } : { userId: string, bio: string }) {
    const [submitted, setSubmitted] = useState(false)

    async function submitBio() {
        const supabase = await createClient()
        await supabase
            .from('users')
            .update({ bio: bio })
            .eq("id", userId)
            .select("bio")
            .single()

        setSubmitted(true)
    }

    return (
        <button
            type="submit"
            className="px-6 py-2 mt-4 rounded-[3px] text-sm font-semibold
                bg-(--color-accent) text-(--color-bg)
                hover:bg-(--color-accent-hover) transition-colors duration-200
                font-(family-name:--font-display)"
            onClick={() => submitBio()}
            >
            {submitted ? "Bio Saved" : "Save to Profile"}
        </button>
    )
}