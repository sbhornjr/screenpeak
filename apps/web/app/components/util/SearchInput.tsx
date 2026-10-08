"use client"

export default function SearchInput( { searchQuery, onChange, onSubmit} : { 
    searchQuery: string, 
    onChange: (s: string) => void,
    onSubmit: () => void
}) {
    return (
        <form
            onSubmit={(e) => { e.preventDefault(); onSubmit() }}
            className="flex gap-2 items-center w-full h-full"
        >
            <input
                type="text"
                placeholder="Search games..."
                value={searchQuery}
                onChange={(e) => onChange(e.target.value)}
                className="w-full min-h-11 text-base bg-(--color-surface) text-(--color-text) placeholder:text-(--color-muted) self-center justify-self-center border border-(--color-border) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:border-(--color-accent) rounded-[3px] px-3 py-2"
            />
            <button
                type="submit"
                className="inline-flex items-center min-h-11 bg-(--color-accent) text-(--color-bg) hover:bg-(--color-accent-hover) self-center justify-self-center px-4 rounded-[3px] font-semibold transition-colors duration-200"
            >
                Search
            </button>
        </form>
    )
}