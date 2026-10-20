import type { ViewerLibraryEntry } from '@screenpeak/shared/api/games'
import type { LibraryGameCard, LibraryPageData, LibraryQuery, LibrarySort } from '@screenpeak/shared/api/library'
import type { ProfilePageData } from '@screenpeak/shared/api/profile'
import type { LibraryWrite } from '@screenpeak/shared/api/writes'

/** The website's lenient library URL: every status, name ascending. */
export const LIBRARY_QUERY: LibraryQuery = {
  q: null,
  genre: null,
  platform: null,
  developer: null,
  publisher: null,
  esrb: null,
  sort: 'name',
  order: 'asc',
  status: '',
  is100: false,
}

export const EMPTY_FACETS: LibraryPageData['facets'] = {
  genres: [],
  platforms: [],
  developers: [],
  publishers: [],
  esrb_ratings: [],
}

/** Name stays ascending. A score or a date starts descending, matching the website. */
export function orderForSort(sort: LibrarySort): 'asc' | 'desc' {
  return sort === 'name' ? 'asc' : 'desc'
}

/** A search or a facet is on. Status tabs and the 100% switch count too. Sort does not. */
export function libraryFiltersActive(query: LibraryQuery): boolean {
  return Boolean(
    query.q
    || query.genre
    || query.platform
    || query.developer
    || query.publisher
    || query.esrb
    || query.status
    || query.is100,
  )
}

/**
 * Open when the viewer owns the library or the player made it public.
 * A missing profile is not a private library.
 */
export function libraryGate(profile: ProfilePageData | null): 'open' | 'private' | 'missing' {
  if (!profile) return 'missing'
  if (profile.viewer?.is_owner || profile.profile.library_public) return 'open'
  return 'private'
}

/** Cache parts for one filtered library. `useRemote` appends the viewer id. */
export function libraryCacheParts(username: string, query: LibraryQuery): readonly unknown[] {
  return [
    'library',
    username,
    query.status,
    query.is100 ? '100' : '',
    query.sort,
    query.order,
    query.q ?? '',
    query.genre ?? '',
    query.platform ?? '',
    query.developer ?? '',
    query.publisher ?? '',
    query.esrb ?? '',
  ]
}

export function cardEntry(game: LibraryGameCard): ViewerLibraryEntry {
  return {
    id: game.id,
    status: game.library_status ?? 'backlog',
    completed_all_achievements: game.completed_all_achievements,
    hours_played: game.hours_played,
    play_count: game.play_count,
  }
}

/** Apply a library write to the cached page. A card that leaves the active filter drops out. */
export function applyLibraryWrite(
  page: LibraryPageData,
  gameId: string,
  write: LibraryWrite,
  query: LibraryQuery,
): LibraryPageData {
  const games = page.games.flatMap((game) => {
    if (game.id !== gameId) return [game]
    const next: LibraryGameCard = {
      ...game,
      library_status: write.status,
      completed_all_achievements: write.completed_all_achievements ?? game.completed_all_achievements,
      hours_played: Object.prototype.hasOwnProperty.call(write, 'hours_played')
        ? (write.hours_played ?? null)
        : game.hours_played,
      play_count: write.play_count ?? game.play_count,
    }
    if (query.status && next.library_status !== query.status) return []
    if (query.is100 && !next.completed_all_achievements) return []
    return [next]
  })
  return { ...page, games }
}

export function withoutLibraryGame(page: LibraryPageData, gameId: string): LibraryPageData {
  return { ...page, games: page.games.filter((game) => game.id !== gameId) }
}
