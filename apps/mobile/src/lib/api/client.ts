import type { ApiErrorBody } from '@screenpeak/shared/api/errors'
import type { GamePageData, GameReviewsPage } from '@screenpeak/shared/api/games'

export class ApiClientError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
  }
}

const REVIEWS_QUERY = 'page=1&pageSize=10&sort=date&order=desc'

export function createApiClient(opts: {
  baseUrl: string
  getToken: () => Promise<string | null>
  fetchImpl?: typeof fetch
}) {
  const base = opts.baseUrl.replace(/\/$/, '')
  const fetchImpl = opts.fetchImpl ?? fetch

  async function get<T>(path: string): Promise<T> {
    if (!base) throw new ApiClientError(0, 'invalid_request', 'EXPO_PUBLIC_API_URL is not set.')
    const token = await opts.getToken()
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetchImpl(`${base}${path}`, { headers })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ApiErrorBody | null
      throw new ApiClientError(res.status, body?.error?.code ?? 'internal', body?.error?.message ?? 'Something went wrong.')
    }
    return res.json() as Promise<T>
  }

  return {
    games: {
      get: (slug: string) => get<GamePageData>(`/api/v1/games/${encodeURIComponent(slug)}`),
      reviews: (slug: string) => get<GameReviewsPage>(`/api/v1/games/${encodeURIComponent(slug)}/reviews?${REVIEWS_QUERY}`),
    },
  }
}
