'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation'
import FilterSelect from "@/app/components/util/FilterSelect"
import SearchInput from '../util/SearchInput';
import SearchableDropdown from '../util/SearchableDropdown';

export default function GameFilters({ current, genres, platforms, esrb_ratings }: 
    { current: {query: string, genre: string, platform: string, developer: string, publisher: string, esrb: string, pageSize: string, sort: string, order: string},
        genres: { id: number, name: string, slug: string }[], platforms: { id: number, name: string, slug: string }[], esrb_ratings: string[]}) {

    const [searchQuery, setSearchQuery] = useState(current.query)
    const [selectedGenre, setSelectedGenre] = useState(current.genre)
    const [selectedPlatform, setSelectedPlatform] = useState(current.platform)
    const [selectedDeveloper, setSelectedDeveloper] = useState(current.developer)
    const [selectedPublisher, setSelectedPublisher] = useState(current.publisher)
    const [selectedEsrb, setSelectedEsrb] = useState(current.esrb)
    const [selectedPageSize, setSelectedPageSize] = useState(current.pageSize)
    const [selectedSort, setSelectedSort] = useState(current.sort)
    const [selectedOrder, setSelectedOrder] = useState(current.order)
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
            pageSize: selectedPageSize,
            ...overrides
        }
        const params = new URLSearchParams()
        Object.entries(values).forEach(([key, val]) => {
            if (val) params.set(key, val)
        })
        return params
    }

    function handleSubmit() {
        router.push(`/games?${buildParams().toString()}`)
    }

    function handlePageSize(size: string) {
        setSelectedPageSize(size)
        router.push(`/games?${buildParams({ pageSize: size, page: "1"})}`)
    }

    function handleSort(sortChoice: string) {
        setSelectedSort(sortChoice)
        router.push(`/games?${buildParams({ sort: sortChoice }).toString()}`)
    }

    function handleSortToggle() {
        const newDirection = selectedOrder === "desc" ? "asc" : "desc"
        setSelectedOrder(newDirection)
        router.push(`/games?${buildParams({ order: newDirection }).toString()}`)
    }

    return (
        <div>
            <div className="flex flex-wrap gap-2 mb-4 items-center w-full">
                <FilterSelect value={selectedPageSize} onChange={e => handlePageSize(e.target.value)} width="w-full sm:w-44">
                    <option value="10">Results: 10</option>
                    <option value="25">Results: 25</option>
                    <option value="50">Results: 50</option>
                    <option value="100">Results: 100</option>
                </FilterSelect>
                <FilterSelect value={selectedSort} onChange={e => handleSort(e.target.value)} width="w-[calc(100%-3.25rem)] sm:w-44">
                    <option value="name">Name</option>
                    <option value="metacritic_score">Metacritic Rating</option>
                    <option value="ngplus_rating">ScreenPeak Rating</option>
                </FilterSelect>
                <button
                    onClick={() => handleSortToggle()}
                    className="inline-flex items-center justify-center min-h-11 min-w-11 px-3 rounded-[3px] border border-(--color-border) bg-(--color-surface)
                        text-(--color-muted) hover:border-(--color-accent) hover:text-(--color-accent)
                        transition-all duration-200"
                    aria-label={selectedOrder === 'desc' ? 'Sort descending — tap for ascending' : 'Sort ascending — tap for descending'}
                    >
                    {selectedOrder === 'desc' ? '↓' : '↑'}
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
                <SearchableDropdown table={"developers"} value={selectedDeveloper} onChange={slug => setSelectedDeveloper(slug)} placeholder={"All Developers"} />
                <SearchableDropdown table={"publishers"} value={selectedPublisher} onChange={slug => setSelectedPublisher(slug)} placeholder={"All Publishers"} />
                <FilterSelect value={selectedEsrb} onChange={e => setSelectedEsrb(e.target.value)} width="w-full sm:w-44">
                    <option value="">All ESRB Ratings</option>
                    {esrb_ratings.map(r => <option key={r} value={r}>{r}</option>)}
                </FilterSelect>
            </div>
            )}
        </div>
    )
}
