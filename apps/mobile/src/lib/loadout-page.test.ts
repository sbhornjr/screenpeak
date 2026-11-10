import type { LoadoutPageData } from '@screenpeak/shared/api/loadout'
import { describe, expect, it } from 'vitest'

import { readoutState, withReadout } from './loadout-page'

const PAGE: LoadoutPageData = {
  username: 'peek',
  total_games: 12,
  completed_games: 4,
  rating_count: 3,
  avg_rating: 7.5,
  identity: '',
  can_generate: false,
  genres: [],
  developers: [],
  distribution: [],
  top_games: [],
  bottom_games: [],
  viewer: { is_owner: true },
}

describe('readoutState', () => {
  it('shows a written Read-out to everyone', () => {
    expect(readoutState({ ...PAGE, identity: 'You chase hard games.' })).toEqual({ kind: 'written', identity: 'You chase hard games.', owner: true })
    expect(readoutState({ ...PAGE, identity: 'You chase hard games.', viewer: null })).toMatchObject({ kind: 'written', owner: false })
  })

  it('counts the ratings the owner still needs, up to five', () => {
    expect(readoutState(PAGE)).toEqual({ kind: 'locked', owner: true, rated: 3, needed: 2 })
    expect(readoutState({ ...PAGE, rating_count: 0 })).toMatchObject({ needed: 5, rated: 0 })
  })

  it('lets the owner generate once the saved stats have five ratings', () => {
    expect(readoutState({ ...PAGE, rating_count: 6, can_generate: true })).toEqual({ kind: 'ready', owner: true })
  })

  it('treats a blank Read-out as none', () => {
    expect(readoutState({ ...PAGE, identity: '   ', can_generate: true }).kind).toBe('ready')
  })

  it('is not the owner for another player or signed out', () => {
    expect(readoutState({ ...PAGE, viewer: { is_owner: false } }).owner).toBe(false)
    expect(readoutState({ ...PAGE, viewer: null }).owner).toBe(false)
  })
})

describe('withReadout', () => {
  it('puts a new Read-out on the page and clears it', () => {
    const written = withReadout(PAGE, 'You chase hard games.')
    expect(written.identity).toBe('You chase hard games.')
    expect(withReadout(written, '').identity).toBe('')
    expect(PAGE.identity).toBe('')
  })
})
