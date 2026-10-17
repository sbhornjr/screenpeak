import { describe, expect, it, vi } from 'vitest'

import { ApiClientError, createApiClient } from './client'

const GAME = {
  game: { id: '11111111-1111-1111-1111-111111111111', name: 'Hades', slug: 'hades' },
  taxonomy: { genres: [], platforms: [], developers: [], publishers: [] },
  stats: { avg_rating: 9.2, total_ratings: 4, total_reviews: 1 },
  viewer: null,
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('createApiClient', () => {
  it('loads a game signed out, with no Authorization header', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, GAME))
    const api = createApiClient({
      baseUrl: 'http://127.0.0.1:3210/',
      getToken: async () => null,
      fetchImpl,
    })

    await expect(api.games.get('hades')).resolves.toEqual(GAME)
    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:3210/api/v1/games/hades', {
      headers: { Accept: 'application/json' },
      credentials: 'omit',
    })
  })

  it('sends the Supabase access token and reads the first review page', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { reviews: [], total: 0, totalPages: 0 }))
    const api = createApiClient({
      baseUrl: 'http://127.0.0.1:3210',
      getToken: async () => 'access-token',
      fetchImpl,
    })

    await api.games.reviews('hades ii')

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:3210/api/v1/games/hades%20ii/reviews?page=1&pageSize=10&sort=date&order=desc',
      { headers: { Accept: 'application/json', Authorization: 'Bearer access-token' }, credentials: 'omit' },
    )
  })

  it('throws the API error body when the game is missing', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(404, { error: { code: 'not_found', message: 'No game with that slug.' } }))
    const api = createApiClient({ baseUrl: 'http://127.0.0.1:3210', getToken: async () => null, fetchImpl })

    await expect(api.games.get('missing')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 404,
      code: 'not_found',
      message: 'No game with that slug.',
    })
    await expect(api.games.get('missing')).rejects.toBeInstanceOf(ApiClientError)
  })

  it('puts a review and a library status with the bearer token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true }))
    const api = createApiClient({
      baseUrl: 'http://127.0.0.1:3210',
      getToken: async () => 'access-token',
      fetchImpl,
    })
    const gameId = GAME.game.id

    await api.games.putReview(gameId, { rating: 8, review: 'sharp' })
    await api.me.library.put(gameId, { status: 'playing' })
    await api.lists.addGame('list-1', gameId)

    expect(fetchImpl).toHaveBeenNthCalledWith(1, `http://127.0.0.1:3210/api/v1/games/${gameId}/review`, {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
      },
      credentials: 'omit',
      body: JSON.stringify({ rating: 8, review: 'sharp' }),
    })
    expect(fetchImpl).toHaveBeenNthCalledWith(2, `http://127.0.0.1:3210/api/v1/me/library/${gameId}`, {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
      },
      credentials: 'omit',
      body: JSON.stringify({ status: 'playing' }),
    })
    expect(fetchImpl).toHaveBeenNthCalledWith(3, 'http://127.0.0.1:3210/api/v1/lists/list-1/games/' + gameId, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: 'Bearer access-token' },
      credentials: 'omit',
    })
  })

  it('treats 204 as an empty success', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 204, json: async () => { throw new Error('no json') } }))
    const api = createApiClient({
      baseUrl: 'http://127.0.0.1:3210',
      getToken: async () => 'access-token',
      fetchImpl,
    })
    await expect(api.me.library.delete(GAME.game.id)).resolves.toBeUndefined()
  })
})
