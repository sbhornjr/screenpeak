// Catalogue and library ordering. The strict parser is for API callers: an
// old Metacritic sort is an invalid request. The lenient parser is for web
// pages, where a hand-edited URL falls back to name ascending.
//
// Community order is average, rating count, name, id, with nulls last.
// Every sort ends in name and id so OFFSET paging does not skip ties.
// `query_games` implements the same order. `date_added` is library-only and
// is ordered in the page from library_entries.created_at.

export const CATALOG_SORTS = ['name', 'ngplus_rating'] as const
export const LIBRARY_SORTS = ['name', 'ngplus_rating', 'your_rating', 'date_added'] as const

export type CatalogSort = (typeof CATALOG_SORTS)[number]
export type LibrarySort = (typeof LIBRARY_SORTS)[number]
export type SortOrder = 'asc' | 'desc'

export class InvalidCatalogSortError extends Error {
    readonly param: 'sort' | 'order'
    constructor(param: 'sort' | 'order') {
        super(`Invalid ${param}`)
        this.name = 'InvalidCatalogSortError'
        this.param = param
    }
}

const DEFAULT_SORT = 'name' satisfies CatalogSort

export function defaultOrder(sort: string): SortOrder {
    return sort === 'name' ? 'asc' : 'desc'
}

function clean(value: string | null | undefined): string {
    return value?.trim() ?? ''
}

export function parseCatalogSort(
    params: { sort?: string | null; order?: string | null },
    allowed: readonly string[],
): { sort: string; order: SortOrder } {
    const sort = clean(params.sort)
    const order = clean(params.order)
    if (sort && !allowed.includes(sort)) throw new InvalidCatalogSortError('sort')
    if (order && order !== 'asc' && order !== 'desc') throw new InvalidCatalogSortError('order')
    const resolved = sort || DEFAULT_SORT
    return { sort: resolved, order: (order || defaultOrder(resolved)) as SortOrder }
}

export function parseCatalogSortLenient(
    params: { sort?: string | null; order?: string | null },
    allowed: readonly string[],
): { sort: string; order: SortOrder } {
    const sort = clean(params.sort)
    const order = clean(params.order)
    if (!sort || !allowed.includes(sort)) return { sort: DEFAULT_SORT, order: 'asc' }
    if (order !== 'asc' && order !== 'desc') return { sort, order: defaultOrder(sort) }
    return { sort, order }
}

export type SortableGame = {
    id: string
    name: string
    avg_ngplus_rating: number | null
    rating_count: number | null
    user_rating: number | null
}

function nullsLast(a: number | null, b: number | null, order: SortOrder): number {
    if (a == null && b == null) return 0
    if (a == null) return 1
    if (b == null) return -1
    return order === 'asc' ? a - b : b - a
}

function byName(a: SortableGame, b: SortableGame, order: SortOrder): number {
    const name = order === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
    if (name !== 0) return name
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

// Mirrors query_games: community and your-rating nulls stay last in either
// direction, then name ascending, then id. Name desc reverses only the name.
export function compareCatalogGames(sort: 'name' | 'ngplus_rating' | 'your_rating', order: SortOrder) {
    return (a: SortableGame, b: SortableGame) => {
        if (sort === 'ngplus_rating') {
            const average = nullsLast(a.avg_ngplus_rating, b.avg_ngplus_rating, order)
            if (average !== 0) return average
            const count = nullsLast(a.rating_count, b.rating_count, order)
            if (count !== 0) return count
            return byName(a, b, 'asc')
        }
        if (sort === 'your_rating') {
            const yours = nullsLast(a.user_rating, b.user_rating, order)
            if (yours !== 0) return yours
            return byName(a, b, 'asc')
        }
        return byName(a, b, order)
    }
}
