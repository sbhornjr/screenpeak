// Typed GET client for /api/v1. No Node, no React — both apps can call it.
// fetch is read off globalThis because this package's tsconfig has no DOM lib.
import type { ApiErrorBody } from './errors'
import type { FeedPageData } from './feed'
import type { ExplorePageData, ExploreRange } from './explore'
import type { GamePageData, GameReviewsPage, GamesListPage, GamesListQuery } from './games'
import type { HomeLandingData } from './home'
import type { LibraryPageData, LibraryQuery } from './library'
import type { ListPageData, ListsPageData, ListsTab } from './lists'
import type { LoadoutPageData } from './loadout'
import type { MeData, SettingsData } from './me'
import type { ProfilePageData } from './profile'
import type { UserReviewsPage, UserReviewsQuery } from './user-reviews'

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

type FetchResponse = {
    ok: boolean
    status: number
    json: () => Promise<unknown>
}

type FetchInit = { headers: Record<string, string>; credentials: 'omit' }
type FetchImpl = (url: string, init: FetchInit) => Promise<FetchResponse>

function defaultFetch(url: string, init: FetchInit): Promise<FetchResponse> {
    const fetchImpl = (globalThis as { fetch?: FetchImpl }).fetch
    if (!fetchImpl) return Promise.reject(new ApiClientError(0, 'internal', 'fetch is not available.'))
    return fetchImpl(url, init)
}

function qs(params: Record<string, string | number | boolean | null | undefined>): string {
    const parts: string[] = []
    for (const [key, value] of Object.entries(params)) {
        if (value == null || value === '') continue
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    }
    return parts.length ? `?${parts.join('&')}` : ''
}

export function createApiClient(opts: {
    baseUrl: string
    getToken: () => Promise<string | null>
    fetchImpl?: FetchImpl
}) {
    const base = opts.baseUrl.replace(/\/$/, '')
    const fetchImpl = opts.fetchImpl ?? defaultFetch

    async function get<T>(path: string): Promise<T> {
        if (!base) throw new ApiClientError(0, 'invalid_request', 'EXPO_PUBLIC_API_URL is not set.')
        const token = await opts.getToken()
        const headers: Record<string, string> = { Accept: 'application/json' }
        if (token) headers.Authorization = `Bearer ${token}`
        const res = await fetchImpl(`${base}${path}`, { headers, credentials: 'omit' })
        if (!res.ok) {
            const body = (await res.json().catch(() => null)) as ApiErrorBody | null
            throw new ApiClientError(res.status, body?.error?.code ?? 'internal', body?.error?.message ?? 'Something went wrong.')
        }
        return res.json() as Promise<T>
    }

    const user = (username: string) => `/api/v1/user/${encodeURIComponent(username)}`

    return {
        games: {
            get: (slug: string) => get<GamePageData>(`/api/v1/games/${encodeURIComponent(slug)}`),
            reviews: (slug: string) => get<GameReviewsPage>(`/api/v1/games/${encodeURIComponent(slug)}/reviews?${REVIEWS_QUERY}`),
            list: (query: Partial<GamesListQuery> = {}) => get<GamesListPage>(`/api/v1/games${qs(query)}`),
        },
        feed: {
            get: (offset = 0) => get<FeedPageData>(`/api/v1/feed${qs({ offset })}`),
        },
        explore: {
            get: (range: ExploreRange = 'week') => get<ExplorePageData>(`/api/v1/explore${qs({ range })}`),
        },
        home: {
            get: () => get<HomeLandingData>('/api/v1/home'),
        },
        me: {
            get: () => get<MeData>('/api/v1/me'),
            settings: () => get<SettingsData>('/api/v1/me/settings'),
        },
        users: {
            get: (username: string) => get<ProfilePageData>(user(username)),
            library: (username: string, query: Partial<LibraryQuery> = {}) =>
                get<LibraryPageData>(`${user(username)}/library${qs({ ...query, is100: query.is100 ? 'true' : undefined })}`),
            lists: (username: string, tab: ListsTab = 'user') =>
                get<ListsPageData>(`${user(username)}/lists${qs({ tab: tab === 'user' ? undefined : tab })}`),
            list: (username: string, listId: string) =>
                get<ListPageData>(`${user(username)}/lists/${encodeURIComponent(listId)}`),
            reviews: (username: string, query: Partial<UserReviewsQuery> = {}) =>
                get<UserReviewsPage>(`${user(username)}/ratings_reviews${qs(query)}`),
            loadout: (username: string) => get<LoadoutPageData>(`${user(username)}/loadout`),
        },
    }
}
