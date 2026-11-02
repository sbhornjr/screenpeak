import { FAVORITE_GAMES_MAX } from '@screenpeak/shared/constants'

/** A game in the favorites picker. Saving sends only the ids, in this order. */
export type FavoritePick = { id: string, name: string }

/**
 * Tap a game in the picker: a picked game drops out, a new one goes first
 * (the website's FavoriteGamePicker order), and a sixth is ignored.
 */
export function toggleFavorite(picks: FavoritePick[], game: FavoritePick): FavoritePick[] {
  if (picks.some(pick => pick.id === game.id)) return picks.filter(pick => pick.id !== game.id)
  if (picks.length >= FAVORITE_GAMES_MAX) return picks
  return [{ id: game.id, name: game.name }, ...picks]
}

export function picksLine(count: number): string {
  return `${count} of ${FAVORITE_GAMES_MAX} picked`
}
