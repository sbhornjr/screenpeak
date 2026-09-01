"use client"

import FilterSelect from "../util/FilterSelect"
import { useRouter } from "next/navigation"

export default function GameReviewsFilters({ gameSlug, pageSize, sort, order, page } :
    { gameSlug: string, pageSize: string, sort: "date" | "rating", order: "asc" | "desc", page: string }) {

    const router = useRouter()

    function buildParams(overrides: Record<string, string> = {}) {
        const values = {
            pageSize: pageSize,
            sort: sort,
            order: order,
            page: page,
            ...overrides
        }
        const params = new URLSearchParams()
        Object.entries(values).forEach(([key, val]) => {
            if (val) params.set(key, val)
        })
        return params
    }

    function handlePageSize(size: string) {
        router.push(`/games/${gameSlug}?${buildParams({ pageSize: size, page: "1" })}`)
    }

    function handleSort(sortChoice: string) {
        router.push(`/games/${gameSlug}?${buildParams({ sort: sortChoice, page: "1" }).toString()}`)
    }

    function handleSortToggle() {
        const newDirection = order === "desc" ? "asc" : "desc"
        router.push(`/games/${gameSlug}?${buildParams({ order: newDirection, page: "1" }).toString()}`)
    }

    return (
        <div className="flex flex-wrap gap-2 mb-4 items-center w-full">
            <FilterSelect value={pageSize} onChange={e => handlePageSize(e.target.value)} width="w-full sm:w-44">
                <option value="10">Results: 10</option>
                <option value="25">Results: 25</option>
                <option value="50">Results: 50</option>
                <option value="100">Results: 100</option>
            </FilterSelect>
            <FilterSelect value={sort} onChange={e => handleSort(e.target.value)} width="w-[calc(100%-3.25rem)] sm:w-44">
                <option value="date">Date</option>
                <option value="rating">Rating</option>
            </FilterSelect>
            <button
                onClick={() => handleSortToggle()}
                className="inline-flex items-center justify-center min-h-11 min-w-11 px-3 rounded-[3px] border border-(--color-border) bg-(--color-surface)
                    text-(--color-muted) hover:border-(--color-accent) hover:text-(--color-accent)
                    transition-all duration-200"
                aria-label={order === 'desc' ? 'Sort descending — tap for ascending' : 'Sort ascending — tap for descending'}
                >
                {order === 'desc' ? '↓' : '↑'}
            </button>
        </div>
    )
}
