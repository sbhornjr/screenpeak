// Href strings the tab screens and the profile hub share. Detail screens are
// pushed on the root stack (`/games/...`, `/user/...`) so Back returns to the
// tab that opened them. `/library` is the Library tab, not a second library page.

export function gameHref(slug: string): string {
  return `/games/${encodeURIComponent(slug)}`
}

export function catalogueHref(filter?: { genre?: string, platform?: string }): string {
  const params = new URLSearchParams()
  if (filter?.genre) params.set('genre', filter.genre)
  if (filter?.platform) params.set('platform', filter.platform)
  const query = params.toString()
  return query ? `/games?${query}` : '/games'
}

export function profileHref(username: string): string {
  return `/user/${encodeURIComponent(username)}`
}

export function listsHref(username: string): string {
  return `${profileHref(username)}/lists`
}

export function listHref(username: string, listId: string): string {
  return `${listsHref(username)}/${encodeURIComponent(listId)}`
}

export function loadoutHref(username: string): string {
  return `${profileHref(username)}/loadout`
}

export function userLibraryHref(username: string): string {
  return `${profileHref(username)}/library`
}
