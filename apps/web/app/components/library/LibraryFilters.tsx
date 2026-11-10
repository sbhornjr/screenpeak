"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import FilterSelect from "@/app/components/util/FilterSelect"
import SearchInput from '../util/SearchInput'
import SearchableDropdown from '../util/SearchableDropdown'
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react"
import { defaultOrder } from "@/lib/game-catalog-sort"

export default function LibraryFilters({ current, genres, platforms, esrb_ratings, username }:
    { current: {query: string, genre: string, platform: string, developer: string, publisher: string, esrb: string, sort: string, order: string, status: string, is100: string},
        genres: { id: string, name: string, slug: string }[], platforms: { id: string, name: string, slug: string }[],
        esrb_ratings: string[], username: string}) {

    const [searchQuery, setSearchQuery] = useState(current.query)
    const [selectedGenre, setSelectedGenre] = useState(current.genre)
    const [selectedPlatform, setSelectedPlatform] = useState(current.platform)
    const [selectedDeveloper, setSelectedDeveloper] = useState(current.developer)
    const [selectedPublisher, setSelectedPublisher] = useState(current.publisher)
    const [selectedEsrb, setSelectedEsrb] = useState(current.esrb)
    const [selectedSort, setSelectedSort] = useState(current.sort)
    const [selectedOrder, setSelectedOrder] = useState(current.order)
    const [selectedStatus, setSelectedStatus] = useState(current.status)
    const [selected100, setSelected100] = useState(current.is100)
    const [filtersOpen, setFiltersOpen] = useState(false)
    const router = useRouter()

    function buildParams(overrides: Record<string, string> = {}) {
        const values = {
            q: searchQuery,
            genre: selectedGenre,
            platform: selectedPlatform,
            developer: selectedDeveloper,
            publisher: selectedPublisher,
            esrb: selectedEsrb,
            sort: selectedSort,
            order: selectedOrder,
            status: selectedStatus,
            is100: selected100,
            ...overrides
        }
        const params = new URLSearchParams()
        Object.entries(values).forEach(([key, val]) => {
            if (val) params.set(key, val)
        })
        return params
    }

    function handleStatus(status: string) {
        setSelectedStatus(status)
        router.push(`/user/${username}/library?${buildParams({ status: status }).toString()}`)
    }

    function handle100Toggle() {
        const next = selected100 === 'true' ? '' : 'true'
        setSelected100(next)
        router.push(`/user/${username}/library?${buildParams({ is100: next }).toString()}`)
    }

    function handleSort(sortChoice: string) {
        // A new key gets that key's default direction. Name stays ascending;
        // a score or date sort starts descending instead of keeping name's asc.
        const order = defaultOrder(sortChoice)
        setSelectedSort(sortChoice)
        setSelectedOrder(order)
        router.push(`/user/${username}/library?${buildParams({ sort: sortChoice, order }).toString()}`)
    }

    function handleSortToggle() {
        const newDirection = selectedOrder === "desc" ? "asc" : "desc"
        setSelectedOrder(newDirection)
        router.push(`/user/${username}/library?${buildParams({ order: newDirection }).toString()}`)
    }

    function handleSubmit() {
        router.push(`/user/${username}/library?${buildParams().toString()}`)
    }

    return (
        <div>
            <div className="flex gap-2 flex-wrap items-center w-full mb-6">
                <button
                    onClick={() => handleStatus("")}
                    className={`text-base inline-flex items-center min-h-10 px-3 rounded-[3px] transition-all duration-200 ${selectedStatus == "" ? "border border-(--color-accent) text-(--color-accent)" : "hover:border hover:border-(--color-accent) hover:text-(--color-accent)"}`}
                >
                    All
                </button>
                <button
                    onClick={() => handleStatus("completed")}
                    className={`text-base inline-flex items-center min-h-10 px-3 rounded-[3px] transition-all duration-200 ${selectedStatus == "completed" ? "border border-(--color-accent) text-(--color-accent)" : "hover:border hover:border-(--color-accent) hover:text-(--color-accent)"}`}
                >
                    Completed
                </button>
                <button
                    onClick={() => handleStatus("playing")}
                    className={`text-base inline-flex items-center min-h-10 px-3 rounded-[3px] transition-all duration-200 ${selectedStatus == "playing" ? "border border-(--color-accent) text-(--color-accent)" : "hover:border hover:border-(--color-accent) hover:text-(--color-accent)"}`}
                >
                    Playing
                </button>
                <button
                    onClick={() => handleStatus("backlog")}
                    className={`text-base inline-flex items-center min-h-10 px-3 rounded-[3px] transition-all duration-200 ${selectedStatus == "backlog" ? "border border-(--color-accent) text-(--color-accent)" : "hover:border hover:border-(--color-accent) hover:text-(--color-accent)"}`}
                >
                    Backlog
                </button>
                <button
                    onClick={() => handleStatus("abandoned")}
                    className={`text-base inline-flex items-center min-h-10 px-3 rounded-[3px] transition-all duration-200 ${selectedStatus == "abandoned" ? "border border-(--color-accent) text-(--color-accent)" : "hover:border hover:border-(--color-accent) hover:text-(--color-accent)"}`}
                >
                    Abandoned
                </button>
                <span className="w-px h-6 bg-(--color-border)" />
                <button
                    onClick={() => handle100Toggle()}
                    className={`text-base inline-flex items-center min-h-10 px-3 rounded-[3px] transition-all duration-200 ${selected100 === 'true' ? "border border-(--color-accent) text-(--color-accent)" : "hover:border hover:border-(--color-accent) hover:text-(--color-accent)"}`}
                >
                    100% only
                </button>
            </div>
            <div className="flex flex-wrap gap-2 mb-4 items-center w-full">
                <FilterSelect value={selectedSort} onChange={e => handleSort(e.target.value)} width="w-[calc(100%-3.25rem)] sm:w-44">
                    <option value="date_added">Date Added</option>
                    <option value="name">Name</option>
                    <option value="ngplus_rating">ScreenPeak Rating</option>
                    <option value="your_rating">Your Rating</option>
                </FilterSelect>
                <button
                    onClick={() => handleSortToggle()}
                    className="inline-flex items-center justify-center min-h-11 min-w-11 px-3 rounded-[3px] border border-(--color-border) bg-(--color-surface)
                        text-(--color-muted) hover:border-(--color-accent) hover:text-(--color-accent)
                        transition-all duration-200"
                    aria-label={selectedOrder === 'desc' ? 'Sort descending — tap for ascending' : 'Sort ascending — tap for descending'}
                    >
                    {selectedOrder === 'desc' ? <ArrowDownWideNarrow size={18} aria-hidden /> : <ArrowUpNarrowWide size={18} aria-hidden />}
                </button>
                <div className="flex-1 min-w-[10rem]">
                    <SearchInput searchQuery={searchQuery} onChange={setSearchQuery} onSubmit={handleSubmit} />
                </div>
                <button
                    onClick={() => setFiltersOpen(!filtersOpen)}
                    className="inline-flex items-center min-h-11 bg-(--color-surface) text-(--color-text) border border-(--color-border) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:border-(--color-accent) rounded-[3px] px-4 whitespace-nowrap"
                >
                    {filtersOpen ? '- Filters' : '+ Filters'}
                </button>
            </div>
            {filtersOpen && (
                <div className="flex flex-wrap flex-row gap-3 sm:gap-4 mb-4">
                    <FilterSelect value={selectedGenre} onChange={e => setSelectedGenre(e.target.value)} width="w-full sm:w-44">
                        <option value="">All Genres</option>
                        {genres.map(g => <option key={g.id} value={g.slug}>{g.name}</option>)}
                    </FilterSelect>
                    <FilterSelect value={selectedPlatform} onChange={e => setSelectedPlatform(e.target.value)} width="w-full sm:w-44">
                        <option value="">All Platforms</option>
                        {platforms.map(p => <option key={p.id} value={p.slug}>{p.name}</option>)}
                    </FilterSelect>
                    <SearchableDropdown table={"developers"} value={selectedDeveloper} onChange={slug => setSelectedDeveloper(slug)} placeholder={"All Developers"} scope="library" />
                    <SearchableDropdown table={"publishers"} value={selectedPublisher} onChange={slug => setSelectedPublisher(slug)} placeholder={"All Publishers"} scope="library" />
                    <FilterSelect value={selectedEsrb} onChange={e => setSelectedEsrb(e.target.value)} width="w-full sm:w-44">
                        <option value="">All ESRB Ratings</option>
                        {esrb_ratings.map(r => <option key={r} value={r}>{r}</option>)}
                    </FilterSelect>
                </div>
            )}
        </div>
    )
}