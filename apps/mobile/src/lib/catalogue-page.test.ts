import type { GameCardData, GamesListPage } from '@screenpeak/shared/api/games'
import { describe, expect, it } from 'vitest'

import {
  CATALOGUE_PAGE_SIZE,
  CATALOGUE_QUERY,
  catalogueChips,
  catalogueGames,
  catalogueQuery,
  nextCataloguePage,
  withoutChip,
} from './catalogue-page'

function game(id: string): GameCardData {
  return { id, name: id, slug: id, cover_image_url: null, released: null, developer: null, avg_rating: null, user_rating: null }
}

function page(ids: string[], totalPages: number, extra: Partial<GamesListPage> = {}): GamesListPage {
  return {
    games: ids.map(game),
    total: totalPages * CATALOGUE_PAGE_SIZE,
    total_pages: totalPages,
    genres: [{ id: 'g1', name: 'Roguelike', slug: 'roguelike' }],
    platforms: [{ id: 'p1', name: 'PC (Windows)', slug: 'win' }],
    esrb_ratings: ['Mature'],
    filter_names: { developer: null, publisher: null },
    viewer: null,
    ...extra,
  }
}

describe('catalogueQuery', () => {
  it('reads the filters a link opens with', () => {
    expect(catalogueQuery({ genre: 'roguelike', developer: ['supergiant', 'other'], q: '  hades ' })).toEqual({
      ...CATALOGUE_QUERY,
      q: 'hades',
      genre: 'roguelike',
      developer: 'supergiant',
    })
  })

  it('starts a score sort high and falls back to name for an unknown sort', () => {
    expect(catalogueQuery({ sort: 'ngplus_rating' })).toMatchObject({ sort: 'ngplus_rating', order: 'desc' })
    expect(catalogueQuery({ sort: 'ngplus_rating', order: 'asc' })).toMatchObject({ sort: 'ngplus_rating', order: 'asc' })
    expect(catalogueQuery({ sort: 'metacritic', order: 'desc' })).toMatchObject({ sort: 'name', order: 'asc' })
  })
})

describe('nextCataloguePage', () => {
  it('asks for the page after the ones loaded until the last page', () => {
    const first = page(['a'], 3)
    const second = page(['b'], 3)
    expect(nextCataloguePage(first, [first])).toBe(2)
    expect(nextCataloguePage(second, [first, second])).toBe(3)
    expect(nextCataloguePage(second, [first, second, page(['c'], 3)])).toBeUndefined()
  })

  it('stops on an empty catalogue', () => {
    const empty = page([], 0)
    expect(nextCataloguePage(empty, [empty])).toBeUndefined()
  })
})

describe('catalogueGames', () => {
  it('joins pages and shows a game that moved to the next page once', () => {
    expect(catalogueGames([page(['a', 'b'], 2), page(['b', 'c'], 2)]).map(item => item.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('catalogueChips', () => {
  it('names each active filter, using the names the server sent', () => {
    const query = { ...CATALOGUE_QUERY, q: 'hades', genre: 'roguelike', platform: 'win', developer: 'supergiant', publisher: 'unknown-pub', esrb: 'Mature' }
    const data = page([], 1, { filter_names: { developer: 'Supergiant Games', publisher: null } })
    expect(catalogueChips(query, data)).toEqual([
      { key: 'q', label: 'Search: hades' },
      { key: 'genre', label: 'Genre: Roguelike' },
      { key: 'platform', label: 'Platform: PC (Windows)' },
      { key: 'developer', label: 'Developer: Supergiant Games' },
      { key: 'publisher', label: 'Publisher: unknown-pub' },
      { key: 'esrb', label: 'ESRB: Mature' },
    ])
  })

  it('has no chips for the plain catalogue, whatever the sort', () => {
    expect(catalogueChips({ ...CATALOGUE_QUERY, sort: 'ngplus_rating', order: 'desc' }, page([], 1))).toEqual([])
  })

  it('removes one filter and keeps the rest', () => {
    const query = { ...CATALOGUE_QUERY, genre: 'roguelike', esrb: 'Mature' }
    expect(withoutChip(query, 'genre')).toEqual({ ...CATALOGUE_QUERY, esrb: 'Mature' })
  })
})
