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
import type { GameSearchPage, TaxonomySearchPage, TaxonomySearchTable } from './search'
import type {
    AvatarSave,
    AvatarUploadRequest,
    AvatarUploadResult,
    FollowResult,
    LibraryWrite,
    LibraryWriteResult,
    ListCreated,
    ListGameSync,
    ListLikeResult,
    ListPinResult,
    ListPinWrite,
    ListWrite,
    MePatch,
    OkResult,
    RatingWrite,
    RatingWriteResult,
    SteamLibraryImportEntry,
} from './writes'

export class ApiClientError extends Error {
    readonly status: number
    readonly code: string
    readonly retryAfter: number | null

    constructor(status: number, code: string, message: string, retryAfter: number | null = null) {
        super(message)
        this.name = 'ApiClientError'
        this.status = status
        this.code = code
        this.retryAfter = retryAfter
    }
}

const REVIEWS_QUERY = 'page=1&pageSize=10&sort=date&order=desc'

type FetchResponse = {
    ok: boolean
    status: number
    json: () => Promise<unknown>
    headers?: { get(name: string): string | null }
}

type FetchInit = {
    method?: string
    headers: Record<string, string>
    credentials: 'omit'
    body?: string
}
type FetchImpl = (url: string, init: FetchInit) => Promise<FetchResponse>

function defaultFetch(url: string, init: FetchInit): Promise<FetchResponse> {
    const fetchImpl = (globalThis as { fetch?: FetchImpl }).fetch
    if (!fetchImpl) return Promise.reject(new ApiClientError(0, 'internal', 'fetch is not available.'))
    return fetchImpl(url, init)
}

function retryAfterOf(res: FetchResponse, body: ApiErrorBody | null): number | null {
    const fromBody = body?.error?.retry_after
    if (typeof fromBody === 'number' && Number.isFinite(fromBody)) return fromBody
    const header = res.headers?.get('retry-after') ?? res.headers?.get('Retry-After')
    if (header == null || header === '') return null
    const parsed = Number(header)
    return Number.isFinite(parsed) ? parsed : null
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
            throw new ApiClientError(
                res.status,
                body?.error?.code ?? 'internal',
                body?.error?.message ?? 'Something went wrong.',
                retryAfterOf(res, body),
            )
        }
        return res.json() as Promise<T>
    }

    async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
        if (!base) throw new ApiClientError(0, 'invalid_request', 'EXPO_PUBLIC_API_URL is not set.')
        const token = await opts.getToken()
        const headers: Record<string, string> = { Accept: 'application/json' }
        if (token) headers.Authorization = `Bearer ${token}`
        const init: FetchInit = { method, headers, credentials: 'omit' }
        if (body !== undefined) {
            headers['Content-Type'] = 'application/json'
            init.body = JSON.stringify(body)
        }
        const res = await fetchImpl(`${base}${path}`, init)
        if (res.status === 204) return undefined as T
        const payload = await res.json().catch(() => null)
        if (!res.ok) {
            const err = payload as ApiErrorBody | null
            throw new ApiClientError(
                res.status,
                err?.error?.code ?? 'internal',
                err?.error?.message ?? 'Something went wrong.',
                retryAfterOf(res, err),
            )
        }
        return payload as T
    }

    const user = (username: string) => `/api/v1/user/${encodeURIComponent(username)}`
    const gameIdPath = (gameId: string) => encodeURIComponent(gameId)
    const listIdPath = (listId: string) => `/api/v1/lists/${encodeURIComponent(listId)}`

    return {
        games: {
            get: (slug: string) => get<GamePageData>(`/api/v1/games/${encodeURIComponent(slug)}`),
            reviews: (slug: string) => get<GameReviewsPage>(`/api/v1/games/${encodeURIComponent(slug)}/reviews?${REVIEWS_QUERY}`),
            list: (query: Partial<GamesListQuery> = {}) => get<GamesListPage>(`/api/v1/games${qs(query)}`),
            search: (q: string, limit?: number) => get<GameSearchPage>(`/api/v1/games/search${qs({ q, limit })}`),
            putReview: (gameId: string, body: RatingWrite) =>
                send<RatingWriteResult>('PUT', `/api/v1/games/${gameIdPath(gameId)}/review`, body),
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
            patch: (body: MePatch) => send<OkResult>('PATCH', '/api/v1/me', body),
            clearLoadout: () => send<OkResult>('DELETE', '/api/v1/me/loadout'),
            library: {
                get: (gameId: string) => send<LibraryWriteResult>('GET', `/api/v1/me/library/${gameIdPath(gameId)}`),
                put: (gameId: string, body: LibraryWrite) =>
                    send<LibraryWriteResult>('PUT', `/api/v1/me/library/${gameIdPath(gameId)}`, body),
                delete: (gameId: string) => send<void>('DELETE', `/api/v1/me/library/${gameIdPath(gameId)}`),
                importSteam: (entries: SteamLibraryImportEntry[]) =>
                    send<OkResult>('POST', '/api/v1/me/library/import', entries),
            },
            avatarUploadUrl: (body: AvatarUploadRequest) =>
                send<AvatarUploadResult>('POST', '/api/v1/me/avatar/upload-url', body),
            saveAvatar: (body: AvatarSave) => send<OkResult>('PUT', '/api/v1/me/avatar', body),
            unlinkSteam: () => send<void>('DELETE', '/api/v1/me/steam'),
        },
        lists: {
            create: (body: ListWrite) => send<ListCreated>('POST', '/api/v1/lists', body),
            update: (listId: string, body: ListWrite | ListPinWrite) =>
                send<OkResult | ListPinResult>('PATCH', listIdPath(listId), body),
            delete: (listId: string) => send<void>('DELETE', listIdPath(listId)),
            like: (listId: string) => send<ListLikeResult>('POST', `${listIdPath(listId)}/like`),
            unlike: (listId: string) => send<ListLikeResult>('DELETE', `${listIdPath(listId)}/like`),
            addGame: (listId: string, gameId: string) =>
                send<OkResult>('POST', `${listIdPath(listId)}/games/${gameIdPath(gameId)}`),
            removeGame: (listId: string, gameId: string) =>
                send<OkResult>('DELETE', `${listIdPath(listId)}/games/${gameIdPath(gameId)}`),
            syncGames: (listId: string, body: ListGameSync) =>
                send<OkResult>('POST', `${listIdPath(listId)}/games/sync`, body),
        },
        taxonomy: {
            search: (table: TaxonomySearchTable, q: string, options?: { ids?: string[], limit?: number }) =>
                get<TaxonomySearchPage>(`/api/v1/taxonomy/${encodeURIComponent(table)}/search${qs({
                    q,
                    limit: options?.limit,
                    ids: options?.ids?.length ? options.ids.join(',') : undefined,
                })}`),
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
            follow: (userId: string) => send<FollowResult>('POST', `/api/v1/user/${encodeURIComponent(userId)}/follow`),
            unfollow: (userId: string) => send<FollowResult>('DELETE', `/api/v1/user/${encodeURIComponent(userId)}/follow`),
        },
    }
}
