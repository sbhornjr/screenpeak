import { describe, expect, it } from 'vitest'

import { picksLine, toggleFavorite } from './favorite-games'

const game = (id: string) => ({ id, name: `Game ${id}` })

describe('favorite game picks', () => {
  it('puts a new pick first, as the website does', () => {
    expect(toggleFavorite([game('a')], game('b')).map(pick => pick.id)).toEqual(['b', 'a'])
  })

  it('drops a game that is already picked and keeps the rest in order', () => {
    expect(toggleFavorite([game('a'), game('b'), game('c')], game('b')).map(pick => pick.id)).toEqual(['a', 'c'])
  })

  it('ignores a sixth game, but still lets you drop one of the five', () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map(game)
    expect(toggleFavorite(five, game('f'))).toBe(five)
    expect(toggleFavorite(five, game('e')).map(pick => pick.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('counts the picks against the limit', () => {
    expect(picksLine(0)).toBe('0 of 5 picked')
    expect(picksLine(5)).toBe('5 of 5 picked')
  })
})
