'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { searchTaxonomyTable, getTaxonomyNameBySlug } from '@/lib/queries/game-search'
import { ChevronDown, X } from "lucide-react"

type Option = { id: string, name: string, slug: string }

export default function SearchableDropdown({ table, value, onChange, placeholder = 'Search...', limit } : 
    { table: 'developers' | 'publishers', value: string, onChange: (slug: string) => void, placeholder?: string, limit?: string[] }) {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<Option[]>([])
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (!query.trim()) {
                setResults([])
                return
            }
            setLoading(true)
            const supabase = createClient()
            const data = await searchTaxonomyTable(supabase, table, query, limit)

            setResults(data)
            setLoading(false)
        }, 300)
        return () => clearTimeout(timer)
    }, [query, table, limit])

    function handleSelect(option: Option) {
        onChange(option.slug)
        setQuery('')
        setOpen(false)
    }

    function handleClear() {
        onChange('')
        setQuery('')
        setResults([])
    }

    const [selectedName, setSelectedName] = useState('')
    useEffect(() => {
        async function fetchSelectedName() {
            if (!value) {
                setSelectedName('')
                return
            }
            const supabase = createClient()
            const name = await getTaxonomyNameBySlug(supabase, table, value)
            setSelectedName(name)
        }
        fetchSelectedName()
    }, [value, table])

    return (
        <div ref={containerRef} className="relative w-full sm:w-48">
            <div
                className={`flex items-center bg-(--color-surface) border rounded-[3px] px-3 py-2 min-h-11
                transition-colors duration-200 cursor-text
                ${open ? 'border-(--color-accent)' : 'border-(--color-border) hover:border-(--color-accent)/50'}`}
                onClick={() => setOpen(true)}
            >
                {!open && selectedName ? (
                <span className="text-sm text-(--color-text) flex-1 truncate">{selectedName}</span>
                ) : (
                <input
                    autoFocus={open}
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={selectedName || placeholder}
                    className="bg-transparent text-sm text-(--color-text) placeholder-(--color-muted) 
                    outline-none flex-1 min-w-0"
                />
                )}
                {value ? (
                <button
                    type="button"
                    onClick={e => { e.stopPropagation(); handleClear() }}
                    aria-label="Clear"
                    className="text-(--color-muted) hover:text-(--color-text) transition-colors ml-2 shrink-0"
                ><X size={14} aria-hidden /></button>
                ) : (
                <ChevronDown size={14} aria-hidden className="text-(--color-muted) ml-2" />
                )}
            </div>

            {open && (
                <div className="absolute z-50 w-full mt-1 bg-(--color-surface) border border-(--color-border)
                    rounded-[3px] shadow-xl max-h-48 overflow-y-scroll">
                    {loading ? (
                        <p className="px-3 py-2 text-sm text-(--color-muted)">Searching...</p>
                    ) : query && results.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-(--color-muted)">No results</p>
                    ) : !query ? (
                        <p className="px-3 py-2 text-sm text-(--color-muted)">Start typing to search</p>
                    ) : (
                        results.map(option => (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => handleSelect(option)}
                                className={`w-full text-left px-3 py-2 text-sm transition-colors duration-150
                                    ${option.slug === value
                                        ? 'text-(--color-accent) bg-(--color-accent)/10'
                                        : 'text-(--color-text) hover:bg-(--color-surface-light)'}`}
                            >
                                {option.name}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}