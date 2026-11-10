import type { GameCardData, GamesListPage, GamesListQuery } from '@screenpeak/shared/api/games'

import { orderForSort } from './library-page'

/** Even, so the two-column grid fills every row but the last page's. */
export const CATALOGUE_PAGE_SIZE = 24

/** What the catalogue screen asks for. The page number comes from scrolling. */
export type CatalogueQuery = Omit<GamesListQuery, 'page' | 'pageSize'>

export type CatalogueSort = CatalogueQuery['sort']

/** The website's plain `/games`: everything, name ascending. */
export const CATALOGUE_QUERY: CatalogueQuery = {
  q: null,
  genre: null,
  platform: null,
  developer: null,
  publisher: null,
  esrb: null,
  sort: 'name',
  order: 'asc',
}

const SORTS: readonly CatalogueSort[] = ['name', 'ngplus_rating']

type Params = Record<string, string | string[] | undefined>

function param(params: Params, name: string): string | null {
  const raw = params[name]
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? ''
  return value ? value : null
}

/** A link's URL params, read the way the website's lenient `/games` reads them. */
export function catalogueQuery(params: Params): CatalogueQuery {
  const sortParam = param(params, 'sort')
  const orderParam = param(params, 'order')
  const sort = SORTS.find(item => item === sortParam)
  if (!sort) return { ...filters(params), sort: 'name', order: 'asc' }
  const order = orderParam === 'asc' || orderParam === 'desc' ? orderParam : orderForSort(sort)
  return { ...filters(params), sort, order }
}

function filters(params: Params) {
  return {
    q: param(params, 'q'),
    genre: param(params, 'genre'),
    platform: param(params, 'platform'),
    developer: param(params, 'developer'),
    publisher: param(params, 'publisher'),
    esrb: param(params, 'esrb'),
  }
}

/** Every loaded page in order. A game added between loads can push one onto the next page; it shows once. */
export function catalogueGames(pages: GamesListPage[]): GameCardData[] {
  const seen = new Set<string>()
  const games: GameCardData[] = []
  for (const page of pages) {
    for (const game of page.games) {
      if (seen.has(game.id)) continue
      seen.add(game.id)
      games.push(game)
    }
  }
  return games
}

export type ChipKey = 'q' | 'genre' | 'platform' | 'developer' | 'publisher' | 'esrb'

export type CatalogueChip = { key: ChipKey, label: string }

/** One removable chip per active filter, named from the page when it can be. */
export function catalogueChips(
  query: CatalogueQuery,
  page: Pick<GamesListPage, 'genres' | 'platforms' | 'filter_names'> | undefined,
): CatalogueChip[] {
  const chips: CatalogueChip[] = []
  const add = (key: ChipKey, prefix: string, value: string | null, name?: string | null) => {
    if (value) chips.push({ key, label: `${prefix}: ${name || value}` })
  }
  add('q', 'Search', query.q)
  add('genre', 'Genre', query.genre, page?.genres.find(item => item.slug === query.genre)?.name)
  add('platform', 'Platform', query.platform, page?.platforms.find(item => item.slug === query.platform)?.name)
  add('developer', 'Developer', query.developer, page?.filter_names.developer)
  add('publisher', 'Publisher', query.publisher, page?.filter_names.publisher)
  add('esrb', 'ESRB', query.esrb)
  return chips
}

export function withoutChip(query: CatalogueQuery, key: ChipKey): CatalogueQuery {
  return { ...query, [key]: null }
}
