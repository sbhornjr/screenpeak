import type { GameCardData } from '@screenpeak/shared/api/games'
import { describe, expect, it } from 'vitest'

import { addedNewFavorite } from './profile-hub'

function game(id: string): GameCardData {
  return { id, name: id, slug: id, cover_image_url: null, released: null, developer: null, avg_rating: null, user_rating: null }
}

describe('addedNewFavorite', () => {
  it('is true when a new game is pinned', () => {
    expect(addedNewFavorite([game('hades')], ['hades', 'elden-ring'])).toBe(true)
  })

  it('is false on a reorder of the same games', () => {
    expect(addedNewFavorite([game('hades'), game('elden-ring')], ['elden-ring', 'hades'])).toBe(false)
  })

  it('is false on a removal, with nothing new added', () => {
    expect(addedNewFavorite([game('hades'), game('elden-ring')], ['hades'])).toBe(false)
  })

  it('is false clearing every favorite', () => {
    expect(addedNewFavorite([game('hades')], [])).toBe(false)
  })
})
