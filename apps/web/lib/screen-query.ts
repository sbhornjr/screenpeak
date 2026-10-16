import { z } from 'zod'
import { GAME_REVIEWS_MAX_PAGE_SIZE, GAME_REVIEWS_PAGE_SIZE } from '@screenpeak/shared/constants'
import type { ExploreRange } from '@screenpeak/shared/api/explore'
import type { GamesListQuery } from '@screenpeak/shared/api/games'
import type { LibraryQuery, LibrarySort, LibraryStatus } from '@screenpeak/shared/api/library'
import type { ListsTab } from '@screenpeak/shared/api/lists'
import type { UserReviewsQuery } from '@screenpeak/shared/api/user-reviews'
import { CATALOG_SORTS, LIBRARY_SORTS, parseCatalogSort, parseCatalogSortLenient, InvalidCatalogSortError } from '@/lib/game-catalog-sort'

// URL parameters for the read endpoints. Strict for /api/v1 (a bad value is
// 400 invalid_request). Lenient for the website, where a hand-edited URL falls
// back per field.

type Parsed<T> = { ok: true; query: T } | { ok: false; message: string }

function fail(error: z.ZodError): Parsed<never> {
    const issue = error.issues[0]
    return { ok: false, message: `Invalid \`${issue.path.join('.') || 'request'}\`: ${issue.message}` }
}

function blank(value: string | null | undefined): string | null {
    const trimmed = value?.trim() ?? ''
    return trimmed ? trimmed : null
}

const pageFields = {
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(GAME_REVIEWS_MAX_PAGE_SIZE).default(GAME_REVIEWS_PAGE_SIZE),
}

function textParams(params: URLSearchParams) {
    return {
        q: params.get('q') ?? undefined,
        genre: params.get('genre') ?? undefined,
        platform: params.get('platform') ?? undefined,
        developer: params.get('developer') ?? undefined,
        publisher: params.get('publisher') ?? undefined,
        esrb: params.get('esrb') ?? undefined,
        sort: params.get('sort') ?? undefined,
        order: params.get('order') ?? undefined,
        page: params.get('page') ?? undefined,
        pageSize: params.get('pageSize') ?? undefined,
    }
}

const filterSchema = z.object({
    q: z.string().optional(),
    genre: z.string().optional(),
    platform: z.string().optional(),
    developer: z.string().optional(),
    publisher: z.string().optional(),
    esrb: z.string().optional(),
    sort: z.string().optional(),
    order: z.string().optional(),
    ...pageFields,
})

export function parseGamesListQuery(params: URLSearchParams): Parsed<GamesListQuery> {
    const result = filterSchema.safeParse(textParams(params))
    if (!result.success) return fail(result.error)
    try {
        const sort = parseCatalogSort({ sort: result.data.sort, order: result.data.order }, CATALOG_SORTS)
        return {
            ok: true,
            query: {
                q: blank(result.data.q),
                genre: blank(result.data.genre),
                platform: blank(result.data.platform),
                developer: blank(result.data.developer),
                publisher: blank(result.data.publisher),
                esrb: blank(result.data.esrb),
                sort: sort.sort as GamesListQuery['sort'],
                order: sort.order,
                page: result.data.page,
                pageSize: result.data.pageSize,
            },
        }
    } catch (error) {
        if (error instanceof InvalidCatalogSortError) return { ok: false, message: `Invalid \`${error.param}\`` }
        throw error
    }
}

type PageSearch = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value
}

export function parseGamesListQueryLenient(params: PageSearch): GamesListQuery {
    const sort = parseCatalogSortLenient({ sort: first(params.sort), order: first(params.order) }, CATALOG_SORTS)
    const page = pageFields.page.catch(1).parse(first(params.page))
    const pageSize = pageFields.pageSize.catch(GAME_REVIEWS_PAGE_SIZE).parse(first(params.pageSize))
    return {
        q: blank(first(params.q)),
        genre: blank(first(params.genre)),
        platform: blank(first(params.platform)),
        developer: blank(first(params.developer)),
        publisher: blank(first(params.publisher)),
        esrb: blank(first(params.esrb)),
        sort: sort.sort as GamesListQuery['sort'],
        order: sort.order,
        page,
        pageSize,
    }
}

const STATUSES = ['', 'playing', 'completed', 'backlog', 'abandoned'] as const

export function parseLibraryQuery(params: URLSearchParams): Parsed<LibraryQuery> {
    const status = (params.get('status') ?? '').trim()
    if (!STATUSES.includes(status as LibraryStatus)) return { ok: false, message: 'Invalid `status`' }
    const is100 = (params.get('is100') ?? '').trim()
    if (is100 && is100 !== 'true' && is100 !== 'false') return { ok: false, message: 'Invalid `is100`' }
    try {
        const sort = parseCatalogSort({ sort: params.get('sort'), order: params.get('order') }, LIBRARY_SORTS)
        return {
            ok: true,
            query: {
                q: blank(params.get('q')),
                genre: blank(params.get('genre')),
                platform: blank(params.get('platform')),
                developer: blank(params.get('developer')),
                publisher: blank(params.get('publisher')),
                esrb: blank(params.get('esrb')),
                sort: sort.sort as LibrarySort,
                order: sort.order,
                status: status as LibraryStatus,
                is100: is100 === 'true',
            },
        }
    } catch (error) {
        if (error instanceof InvalidCatalogSortError) return { ok: false, message: `Invalid \`${error.param}\`` }
        throw error
    }
}

export function parseLibraryQueryLenient(params: PageSearch): LibraryQuery {
    const status = (first(params.status) ?? '').trim()
    const sort = parseCatalogSortLenient({ sort: first(params.sort), order: first(params.order) }, LIBRARY_SORTS)
    return {
        q: blank(first(params.q)),
        genre: blank(first(params.genre)),
        platform: blank(first(params.platform)),
        developer: blank(first(params.developer)),
        publisher: blank(first(params.publisher)),
        esrb: blank(first(params.esrb)),
        sort: sort.sort as LibrarySort,
        order: sort.order,
        status: (STATUSES as readonly string[]).includes(status) ? status as LibraryStatus : '',
        is100: first(params.is100)?.trim() === 'true',
    }
}

const RANGES = ['week', 'month', 'year', 'alltime'] as const

export function parseExploreQuery(params: URLSearchParams): Parsed<{ range: ExploreRange }> {
    const range = (params.get('range') ?? 'week').trim()
    if (!(RANGES as readonly string[]).includes(range)) return { ok: false, message: 'Invalid `range`' }
    return { ok: true, query: { range: range as ExploreRange } }
}

export function parseExploreQueryLenient(params: PageSearch): { range: ExploreRange } {
    const range = (first(params.range) ?? 'week').trim()
    return { range: (RANGES as readonly string[]).includes(range) ? range as ExploreRange : 'week' }
}

export function parseFeedQuery(params: URLSearchParams): Parsed<{ offset: number }> {
    const raw = params.get('offset')
    if (raw == null || raw.trim() === '') return { ok: true, query: { offset: 0 } }
    const offset = Number(raw)
    if (!Number.isInteger(offset) || offset < 0 || offset > 100_000) return { ok: false, message: 'Invalid `offset`' }
    return { ok: true, query: { offset } }
}

const reviewFields = {
    filter: z.enum(['all', 'ratings', 'reviews']).default('all'),
    sort: z.enum(['date', 'rating']).default('date'),
    order: z.enum(['asc', 'desc']).default('desc'),
    ...pageFields,
}
const reviewSchema = z.object(reviewFields)

export function parseUserReviewsQuery(params: URLSearchParams): Parsed<UserReviewsQuery> {
    const result = reviewSchema.safeParse({
        filter: params.get('filter') ?? undefined,
        sort: params.get('sort') ?? undefined,
        order: params.get('order') ?? undefined,
        page: params.get('page') ?? undefined,
        pageSize: params.get('pageSize') ?? undefined,
    })
    if (!result.success) return fail(result.error)
    return { ok: true, query: result.data }
}

export function parseUserReviewsQueryLenient(params: PageSearch): UserReviewsQuery {
    return {
        filter: reviewFields.filter.catch('all').parse(first(params.filter)),
        sort: reviewFields.sort.catch('date').parse(first(params.sort)),
        order: reviewFields.order.catch('desc').parse(first(params.order)),
        page: pageFields.page.catch(1).parse(first(params.page)),
        pageSize: pageFields.pageSize.catch(GAME_REVIEWS_PAGE_SIZE).parse(first(params.pageSize)),
    }
}

export function parseListsTab(params: URLSearchParams): Parsed<{ tab: ListsTab }> {
    const tab = (params.get('tab') ?? 'user').trim()
    if (tab !== 'user' && tab !== 'liked') return { ok: false, message: 'Invalid `tab`' }
    return { ok: true, query: { tab } }
}

export function parseListsTabLenient(params: PageSearch): { tab: ListsTab } {
    return { tab: first(params.tab) === 'liked' ? 'liked' : 'user' }
}
