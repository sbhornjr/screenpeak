import { describe, it, expect } from 'vitest'
import {
    CATALOG_SORTS,
    LIBRARY_SORTS,
    InvalidCatalogSortError,
    defaultOrder,
    parseCatalogSort,
    parseCatalogSortLenient,
} from '@/lib/game-catalog-sort'

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

describe('defaultOrder', () => {
    it('uses descending for every non-name key', () => {
        expect(defaultOrder('name')).toBe('asc')
        expect(defaultOrder('ngplus_rating')).toBe('desc')
        expect(defaultOrder('your_rating')).toBe('desc')
        expect(defaultOrder('date_added')).toBe('desc')
    })
})
