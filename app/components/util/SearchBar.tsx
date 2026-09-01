'use client'

import { useRouter } from 'next/navigation'
import { useState, ChangeEvent, SubmitEvent } from 'react'

export default function SearchBar() {
    const router = useRouter()
    const [query, setQuery] = useState('')

    function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
        e.preventDefault()
        const trimmed = query.trim()
        if (!trimmed) return
        router.push(`/games?q=${encodeURIComponent(trimmed)}`)
    }

    function handleChange(e: ChangeEvent<HTMLInputElement>) {
        setQuery(e.target.value)
    }

    return (
        <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
            <div className="relative">
                <input
                    type="text"
                    value={query}
                    onChange={handleChange}
                    placeholder="Search games..."
                    className="w-full px-6 py-4 pr-36 pl-5 rounded-[3px] text-base
                        bg-(--color-surface) border border-(--color-border) text-(--color-text)
                        placeholder-(--color-muted) outline-none
                        focus:border-(--color-accent) focus:ring-1 focus:ring-(--color-accent)
                        transition-all duration-200"
                />
                <button
                    type="submit"
                    className="absolute right-2 top-1/2 -translate-y-1/2
                        px-6 py-2.5 rounded-[3px] text-sm font-semibold
                        bg-(--color-accent) text-(--color-bg)
                        hover:bg-(--color-accent-hover) transition-colors duration-200
                        font-(family-name:--font-display)"
                >
                    Search
                </button>
            </div>
        </form>
    )
}