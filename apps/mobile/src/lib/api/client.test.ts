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

    await api.games.reviews('hades', { page: 2, sort: 'rating', order: 'asc' })
    expect(fetchImpl).toHaveBeenLastCalledWith(
      'http://127.0.0.1:3210/api/v1/games/hades/reviews?page=2&pageSize=10&sort=rating&order=asc',
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

  it('searches games and taxonomy without a token when signed out', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { games: [] }))
    const api = createApiClient({
      baseUrl: 'http://127.0.0.1:3210',
      getToken: async () => null,
      fetchImpl,
    })

    await api.games.search('Hades II', 10)
    await api.taxonomy.search('developers', 'from')

    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:3210/api/v1/games/search?q=Hades%20II&limit=10', {
      headers: { Accept: 'application/json' },
      credentials: 'omit',
    })
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:3210/api/v1/taxonomy/developers/search?q=from', {
      headers: { Accept: 'application/json' },
      credentials: 'omit',
    })

    const dev = '22222222-2222-4222-8222-222222222222'
    await api.taxonomy.search('publishers', 'bandai', { ids: [dev], limit: 5 })
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      `http://127.0.0.1:3210/api/v1/taxonomy/publishers/search?q=bandai&limit=5&ids=${dev}`,
      { headers: { Accept: 'application/json' }, credentials: 'omit' },
    )
  })

  it('surfaces retry_after when the search budget is spent', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 429,
      headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? '8' : null) },
      json: async () => ({ error: { code: 'rate_limited', message: 'Too many requests. Try again soon.', retry_after: 8 } }),
    }))
    const api = createApiClient({
      baseUrl: 'http://127.0.0.1:3210',
      getToken: async () => null,
      fetchImpl,
    })

    await expect(api.games.search('hades')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 429,
      code: 'rate_limited',
      retryAfter: 8,
    })
  })

  it('starts a Steam link and asks for the next import batch without cookies', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true }))
    const api = createApiClient({
      baseUrl: 'http://127.0.0.1:3210',
      getToken: async () => 'access-token',
      fetchImpl,
    })

    const challenge = 'a'.repeat(43)
    await api.me.steamLinkIntent({ codeChallenge: challenge })
    await api.me.steamLinkComplete({ code: 'c'.repeat(43), verifier: 'v'.repeat(43) })
    await api.me.steamImportBatch({ retry: true, cursor: { phase: 'pending', afterAppId: 40 } })
    await api.appConfig()

    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:3210/api/v1/me/steam/link-intent', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
      },
      credentials: 'omit',
      body: JSON.stringify({ codeChallenge: challenge }),
    })
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:3210/api/v1/me/steam/link-complete', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
      },
      credentials: 'omit',
      body: JSON.stringify({ code: 'c'.repeat(43), verifier: 'v'.repeat(43) }),
    })
    expect(fetchImpl).toHaveBeenNthCalledWith(3, 'http://127.0.0.1:3210/api/v1/me/steam/import', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
      },
      credentials: 'omit',
      body: JSON.stringify({ retry: true, cursor: { phase: 'pending', afterAppId: 40 } }),
    })
    expect(fetchImpl).toHaveBeenNthCalledWith(4, 'http://127.0.0.1:3210/api/v1/app-config', {
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
