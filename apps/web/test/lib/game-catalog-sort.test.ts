import { describe, it, expect } from 'vitest'
import {
    CATALOG_SORTS,
    LIBRARY_SORTS,
    InvalidCatalogSortError,
    compareCatalogGames,
    parseCatalogSort,
    parseCatalogSortLenient,
    type SortableGame,
} from '@/lib/game-catalog-sort'

const row = (patch: Partial<SortableGame> & Pick<SortableGame, 'id' | 'name'>): SortableGame => ({
    avg_ngplus_rating: null,
    rating_count: null,
    user_rating: null,
    ...patch,
})

describe('parseCatalogSort', () => {
    it('defaults a catalogue request to name ascending', () => {
        expect(parseCatalogSort({}, CATALOG_SORTS)).toEqual({ sort: 'name', order: 'asc' })
    })

    it('rejects a Metacritic sort instead of honouring it', () => {
        expect(() => parseCatalogSort({ sort: 'metacritic_score', order: 'desc' }, CATALOG_SORTS))
            .toThrow(InvalidCatalogSortError)
        try {
            parseCatalogSort({ sort: 'metacritic_score' }, LIBRARY_SORTS)
        } catch (error) {
            expect(error).toBeInstanceOf(InvalidCatalogSortError)
            expect((error as InvalidCatalogSortError).param).toBe('sort')
        }
    })

    it('rejects an unknown order', () => {
        expect(() => parseCatalogSort({ sort: 'name', order: 'sideways' }, CATALOG_SORTS)).toThrow(/order/)
    })
})

describe('parseCatalogSortLenient', () => {
    it('falls old Metacritic URLs back to name ascending', () => {
        expect(parseCatalogSortLenient({ sort: 'metacritic_score', order: 'desc' }, CATALOG_SORTS))
            .toEqual({ sort: 'name', order: 'asc' })
        expect(parseCatalogSortLenient({ sort: 'metacritic_score', order: 'asc' }, LIBRARY_SORTS))
            .toEqual({ sort: 'name', order: 'asc' })
    })

    it('keeps a community sort and defaults its direction to descending', () => {
        expect(parseCatalogSortLenient({ sort: 'ngplus_rating' }, CATALOG_SORTS))
            .toEqual({ sort: 'ngplus_rating', order: 'desc' })
    })

    it('keeps library-only sorts', () => {
        expect(parseCatalogSortLenient({ sort: 'date_added', order: 'asc' }, LIBRARY_SORTS))
            .toEqual({ sort: 'date_added', order: 'asc' })
        expect(parseCatalogSortLenient({ sort: 'your_rating' }, LIBRARY_SORTS).sort).toBe('your_rating')
    })
})

describe('compareCatalogGames', () => {
    const games = [
        row({ id: '00000000-0000-0000-0000-000000000002', name: 'Same', avg_ngplus_rating: 9, rating_count: 2 }),
        row({ id: '00000000-0000-0000-0000-000000000001', name: 'Same', avg_ngplus_rating: 9, rating_count: 4 }),
        row({ id: '00000000-0000-0000-0000-000000000003', name: 'Later', avg_ngplus_rating: 9, rating_count: 4 }),
        row({ id: '00000000-0000-0000-0000-000000000004', name: 'Alpha', avg_ngplus_rating: null, rating_count: null }),
        row({ id: '00000000-0000-0000-0000-000000000005', name: 'Zero', avg_ngplus_rating: 7, rating_count: 1, user_rating: 7 }),
    ]

    it('orders the community by average, count, name, then id, with nulls last', () => {
        const ordered = [...games].sort(compareCatalogGames('ngplus_rating', 'desc')).map(game => game.id)
        expect(ordered).toEqual([
            '00000000-0000-0000-0000-000000000003',
            '00000000-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-000000000002',
            '00000000-0000-0000-0000-000000000005',
            '00000000-0000-0000-0000-000000000004',
        ])
    })

    it('keeps an id tie-break when names match, including name descending', () => {
        const names = [
            row({ id: 'b', name: 'Same' }),
            row({ id: 'a', name: 'Same' }),
            row({ id: 'c', name: 'Other' }),
        ]
        expect([...names].sort(compareCatalogGames('name', 'asc')).map(game => game.id)).toEqual(['c', 'a', 'b'])
        expect([...names].sort(compareCatalogGames('name', 'desc')).map(game => game.id)).toEqual(['a', 'b', 'c'])
    })
})
