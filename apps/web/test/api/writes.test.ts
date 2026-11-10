import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { ApiError, UnauthenticatedError } from '@/lib/api'
import { writeErrorText } from '@/lib/write-http'

const requireBearerUser = vi.fn()
const getUserRatingReviewForGame = vi.fn()
const saveRatingReview = vi.fn()
const getLibraryEntry = vi.fn()
const upsertLibraryEntry = vi.fn()
const deleteLibraryEntryByGame = vi.fn()
const importConfirmedSteamLibrary = vi.fn()
const createList = vi.fn()
const createListWithGame = vi.fn()
const updateList = vi.fn()
const deleteList = vi.fn()
const setListPinned = vi.fn()
const likeList = vi.fn()
const unlikeList = vi.fn()
const addGameToList = vi.fn()
const removeGameFromList = vi.fn()
const syncListGames = vi.fn()
const followUser = vi.fn()
const unfollowUser = vi.fn()
const userExists = vi.fn()
const patchAccount = vi.fn()
const updateBio = vi.fn()
const updateSelectedTitle = vi.fn()
const updateLoadoutBio = vi.fn()
const updateFavoriteGames = vi.fn()
const updatePrivacy = vi.fn()
const updateAvatarUrl = vi.fn()
const clearLoadoutIdentity = vi.fn()
const createPresignedAvatarUploadUrl = vi.fn()
const unlinkSteamAccount = vi.fn()
const generateReadout = vi.fn()
const deleteAccount = vi.fn()

class SteamImportInputError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'SteamImportInputError'
    }
}

vi.mock('@/lib/auth', () => ({ requireBearerUser, getBearerUser: vi.fn() }))
const consumeWriteRateLimit = vi.fn(async () => {})
vi.mock('@/lib/rate-limit', () => ({ consumeWriteRateLimit }))
vi.mock('@/lib/queries/review', () => ({ getUserRatingReviewForGame, saveRatingReview }))
vi.mock('@/lib/queries/library', () => ({ getLibraryEntry, upsertLibraryEntry, deleteLibraryEntryByGame }))
vi.mock('@/lib/catalog/steam-import', () => ({ importConfirmedSteamLibrary, SteamImportInputError }))
vi.mock('@/lib/queries/list', () => ({
    createList, createListWithGame, updateList, deleteList, setListPinned, likeList, unlikeList,
    addGameToList, removeGameFromList, syncListGames,
}))
vi.mock('@/lib/queries/user', () => ({
    followUser, unfollowUser, userExists, patchAccount, updateBio, updateSelectedTitle,
    updateLoadoutBio, updateFavoriteGames, updatePrivacy, updateAvatarUrl, clearLoadoutIdentity,
}))
vi.mock('@/lib/queries/steam', () => ({ unlinkSteamAccount }))
vi.mock('@/lib/r2', () => ({ createPresignedAvatarUploadUrl }))
vi.mock('@/lib/loaders/me', () => ({ loadMe: vi.fn() }))
vi.mock('@/lib/loadout-readout', () => ({ generateReadout }))
vi.mock('@/lib/account-deletion', () => ({ deleteAccount }))

const review = await import('@/app/api/v1/games/[slug]/review/route')
const library = await import('@/app/api/v1/me/library/[gameId]/route')
const steamImport = await import('@/app/api/v1/me/library/import/route')
const lists = await import('@/app/api/v1/lists/route')
const listItem = await import('@/app/api/v1/lists/[listId]/route')
const like = await import('@/app/api/v1/lists/[listId]/like/route')
const listGame = await import('@/app/api/v1/lists/[listId]/games/[gameId]/route')
const sync = await import('@/app/api/v1/lists/[listId]/games/sync/route')
const follow = await import('@/app/api/v1/user/[username]/follow/route')
const me = await import('@/app/api/v1/me/route')
const loadout = await import('@/app/api/v1/me/loadout/route')
const avatarUpload = await import('@/app/api/v1/me/avatar/upload-url/route')
const avatar = await import('@/app/api/v1/me/avatar/route')
const steam = await import('@/app/api/v1/me/steam/route')

const USER = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'a@x.test' }
const GAME = '11111111-1111-4111-8111-111111111111'
const LIST = '22222222-2222-4222-8222-222222222222'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

type CallInit = { method?: string, body?: string, headers?: Record<string, string> }

function call(handler: unknown, url: string, params: Record<string, string>, init?: CallInit): Promise<Response> {
    const invoke = handler as (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>
    return invoke(new NextRequest(url, init), { params: Promise.resolve(params) })
}

const jsonInit = (method: string, body: unknown): CallInit => ({
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
})

beforeEach(() => {
    requireBearerUser.mockReset().mockResolvedValue(USER)
    consumeWriteRateLimit.mockReset().mockResolvedValue(undefined)
    for (const fn of [
        getUserRatingReviewForGame, saveRatingReview, getLibraryEntry, upsertLibraryEntry, deleteLibraryEntryByGame,
        importConfirmedSteamLibrary, createList, createListWithGame, updateList, deleteList, setListPinned, likeList, unlikeList,
        addGameToList, removeGameFromList, syncListGames, followUser, unfollowUser, userExists, patchAccount,
        updateBio, updateSelectedTitle, updateLoadoutBio, updateFavoriteGames, updatePrivacy, updateAvatarUrl,
        clearLoadoutIdentity, createPresignedAvatarUploadUrl, unlinkSteamAccount, generateReadout, deleteAccount,
    ]) fn.mockReset()
    userExists.mockResolvedValue(true)
})

describe('write routes reject a missing bearer before any write', () => {
    it('answers 401 and does not save a rating', async () => {
        requireBearerUser.mockRejectedValue(new UnauthenticatedError())

        const res = await call(review.PUT, `http://localhost/api/v1/games/${GAME}/review`, { slug: GAME }, jsonInit('PUT', { rating: 8, review: 'hi' }))

        expect(res.status).toBe(401)
        expect((await res.json()).error.code).toBe('unauthenticated')
        expect(saveRatingReview).not.toHaveBeenCalled()
        expect(consumeWriteRateLimit).not.toHaveBeenCalled()
    })
})

describe('PUT /api/v1/games/[gameId]/review', () => {
    it('rejects a rating outside 1–10 before writing', async () => {
        const res = await call(review.PUT, `http://localhost/api/v1/games/${GAME}/review`, { slug: GAME }, jsonInit('PUT', { rating: 0, review: '' }))

        expect(res.status).toBe(400)
        expect((await res.json()).error).toMatchObject({ code: 'invalid_request' })
        expect(saveRatingReview).not.toHaveBeenCalled()
    })

    it('rejects a non-uuid game id', async () => {
        const res = await call(review.PUT, 'http://localhost/api/v1/games/hades/review', { slug: 'hades' }, jsonInit('PUT', { rating: 8, review: '' }))

        expect(res.status).toBe(400)
        expect((await res.json()).error.message).toMatch(/gameId/)
        expect(saveRatingReview).not.toHaveBeenCalled()
    })

    it('creates a rating for the bearer user and ignores a user id in the body', async () => {
        getUserRatingReviewForGame.mockResolvedValue(null)
        saveRatingReview.mockResolvedValue({
            data: {
                rating: 8, review: 'sharp', user_id: USER.id,
                created_at: '2026-04-01 12:00:00.000+00', updated_at: '2026-04-01 12:00:00.000+00',
            },
            error: null,
        })

        const res = await call(
            review.PUT,
            `http://localhost/api/v1/games/${GAME}/review`,
            { slug: GAME },
            jsonInit('PUT', { rating: 8, review: 'sharp', userId: OTHER }),
        )

        expect(res.status).toBe(201)
        expect(await res.json()).toMatchObject({
            rating: 8, review: 'sharp', user_id: USER.id,
            created_at: '2026-04-01T12:00:00.000Z', updated_at: '2026-04-01T12:00:00.000Z',
        })
        expect(saveRatingReview).toHaveBeenCalledWith(USER.id, GAME, 8, 'sharp', false)
        expect(res.headers.get('cache-control')).toBe('private, no-store')
    })

    it('updates when the bearer user already rated the game', async () => {
        getUserRatingReviewForGame.mockResolvedValue({ rating: 6 })
        saveRatingReview.mockResolvedValue({
            data: {
                rating: 9, review: '', user_id: USER.id,
                created_at: '2026-04-01 12:00:00.000+00', updated_at: '2026-04-02 12:00:00.000+00',
            },
            error: null,
        })

        const res = await call(review.PUT, `http://localhost/api/v1/games/${GAME}/review`, { slug: GAME }, jsonInit('PUT', { rating: 9, review: '' }))

        expect(res.status).toBe(200)
        expect(saveRatingReview).toHaveBeenCalledWith(USER.id, GAME, 9, '', true)
    })
})

describe('library log', () => {
    const row = { id: 'le-1', status: 'playing', completed_all_achievements: false, hours_played: '12.5', play_count: 2 }

    it('returns the caller\'s entry with hours as a number', async () => {
        getLibraryEntry.mockResolvedValue(row)

        const res = await call(library.GET, `http://localhost/api/v1/me/library/${GAME}`, { gameId: GAME })

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({
            id: 'le-1', status: 'playing', completed_all_achievements: false, hours_played: 12.5, play_count: 2,
        })
        expect(getLibraryEntry).toHaveBeenCalledWith(USER.id, GAME)
        expect(consumeWriteRateLimit).not.toHaveBeenCalled()
    })

    it('answers 404 when the game is not in the caller\'s save', async () => {
        getLibraryEntry.mockResolvedValue(null)

        const res = await call(library.GET, `http://localhost/api/v1/me/library/${GAME}`, { gameId: GAME })

        expect(res.status).toBe(404)
        expect((await res.json()).error.code).toBe('not_found')
    })

    it('saves a status for the bearer user', async () => {
        upsertLibraryEntry.mockResolvedValue(row)

        const res = await call(
            library.PUT,
            `http://localhost/api/v1/me/library/${GAME}`,
            { gameId: GAME },
            jsonInit('PUT', { status: 'completed', userId: OTHER }),
        )

        expect(res.status).toBe(200)
        expect(upsertLibraryEntry).toHaveBeenCalledWith(USER.id, GAME, { status: 'completed' })
        expect(consumeWriteRateLimit).toHaveBeenCalledWith(USER.id)
    })

    it('returns 429 when the write budget is spent and does not write', async () => {
        consumeWriteRateLimit.mockRejectedValueOnce(new ApiError(429, 'rate_limited', 'Too many requests. Try again soon.', { 'Retry-After': '3' }))

        const res = await call(
            library.PUT,
            `http://localhost/api/v1/me/library/${GAME}`,
            { gameId: GAME },
            jsonInit('PUT', { status: 'completed' }),
        )

        expect(res.status).toBe(429)
        expect((await res.json()).error.code).toBe('rate_limited')
        expect(upsertLibraryEntry).not.toHaveBeenCalled()
    })

    it('rejects an unknown status', async () => {
        const res = await call(library.PUT, `http://localhost/api/v1/me/library/${GAME}`, { gameId: GAME }, jsonInit('PUT', { status: 'maybe' }))

        expect(res.status).toBe(400)
        expect(upsertLibraryEntry).not.toHaveBeenCalled()
    })

    it('removes only the caller\'s row', async () => {
        deleteLibraryEntryByGame.mockResolvedValue('le-1')

        const res = await call(library.DELETE, `http://localhost/api/v1/me/library/${GAME}`, { gameId: GAME }, { method: 'DELETE' })

        expect(res.status).toBe(204)
        expect(deleteLibraryEntryByGame).toHaveBeenCalledWith(USER.id, GAME)
    })
})

describe('lists', () => {
    const fields = { name: 'Queue', description: '', isPublic: true, isPinned: false }

    it('creates a list owned by the bearer user', async () => {
        createList.mockResolvedValue({ data: { id: LIST }, error: null })

        const res = await call(lists.POST, 'http://localhost/api/v1/lists', {}, jsonInit('POST', { ...fields, userId: OTHER }))

        expect(res.status).toBe(201)
        expect(await res.json()).toEqual({ id: LIST })
        expect(createList).toHaveBeenCalledWith(USER.id, fields)
        expect(createListWithGame).not.toHaveBeenCalled()
    })

    it('creates a list and adds the game when gameId is set', async () => {
        createListWithGame.mockResolvedValue({ data: { id: LIST }, error: null })

        const res = await call(lists.POST, 'http://localhost/api/v1/lists', {}, jsonInit('POST', { ...fields, gameId: GAME }))

        expect(res.status).toBe(201)
        expect(createListWithGame).toHaveBeenCalledWith(USER.id, GAME, fields)
    })

    it('rejects an empty list name', async () => {
        const res = await call(lists.POST, 'http://localhost/api/v1/lists', {}, jsonInit('POST', { ...fields, name: '  ' }))

        expect(res.status).toBe(400)
        expect(createList).not.toHaveBeenCalled()
    })

    it('refuses to edit a list the caller does not own', async () => {
        updateList.mockResolvedValue({ error: 'List not found' })

        const res = await call(listItem.PATCH, `http://localhost/api/v1/lists/${LIST}`, { listId: LIST }, jsonInit('PATCH', fields))

        expect(res.status).toBe(404)
        expect((await res.json()).error.code).toBe('not_found')
        expect(updateList).toHaveBeenCalledWith(LIST, fields, USER.id)
    })

    it('deletes only the caller\'s list', async () => {
        deleteList.mockResolvedValue({ error: null })

        const res = await call(listItem.DELETE, `http://localhost/api/v1/lists/${LIST}`, { listId: LIST }, { method: 'DELETE' })

        expect(res.status).toBe(204)
        expect(deleteList).toHaveBeenCalledWith(LIST, USER.id)
    })

    it('answers 404 when deleting a list the caller does not own', async () => {
        deleteList.mockResolvedValue({ error: 'List not found' })

        const res = await call(listItem.DELETE, `http://localhost/api/v1/lists/${LIST}`, { listId: LIST }, { method: 'DELETE' })

        expect(res.status).toBe(404)
        expect((await res.json()).error.code).toBe('not_found')
    })

    it('pins only the caller\'s list', async () => {
        setListPinned.mockResolvedValue({ isPinned: true, error: null })

        const res = await call(listItem.PATCH, `http://localhost/api/v1/lists/${LIST}`, { listId: LIST }, jsonInit('PATCH', { isPinned: true }))

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true, isPinned: true })
        expect(setListPinned).toHaveBeenCalledWith(LIST, true, USER.id)
        expect(updateList).not.toHaveBeenCalled()
    })

    it('likes and unlikes without taking a user id from the client', async () => {
        likeList.mockResolvedValue({ error: null })
        unlikeList.mockResolvedValue({ error: null })

        const liked = await call(like.POST, `http://localhost/api/v1/lists/${LIST}/like`, { listId: LIST }, { method: 'POST' })
        const unliked = await call(like.DELETE, `http://localhost/api/v1/lists/${LIST}/like`, { listId: LIST }, { method: 'DELETE' })

        expect(liked.status).toBe(200)
        expect(await liked.json()).toEqual({ liked: true })
        expect(likeList).toHaveBeenCalledWith(LIST, USER.id)
        expect(unliked.status).toBe(200)
        expect(await unliked.json()).toEqual({ liked: false })
    })

    it('adds and removes a game on the caller\'s list', async () => {
        addGameToList.mockResolvedValue({ error: null })
        removeGameFromList.mockResolvedValue({ error: null })

        const added = await call(listGame.POST, `http://localhost/api/v1/lists/${LIST}/games/${GAME}`, { listId: LIST, gameId: GAME }, { method: 'POST' })
        const removed = await call(listGame.DELETE, `http://localhost/api/v1/lists/${LIST}/games/${GAME}`, { listId: LIST, gameId: GAME }, { method: 'DELETE' })

        expect(added.status).toBe(200)
        expect(addGameToList).toHaveBeenCalledWith(LIST, GAME, USER.id)
        expect(removed.status).toBe(200)
        expect(removeGameFromList).toHaveBeenCalledWith(LIST, GAME, USER.id)
    })

    it('answers 404 when adding to someone else\'s list', async () => {
        addGameToList.mockResolvedValue({ error: 'List not found' })

        const res = await call(listGame.POST, `http://localhost/api/v1/lists/${LIST}/games/${GAME}`, { listId: LIST, gameId: GAME }, { method: 'POST' })

        expect(res.status).toBe(404)
    })

    it('syncs game ids for the caller and rejects a non-uuid', async () => {
        syncListGames.mockResolvedValue({ error: null })
        const body = { toAdd: [{ id: GAME }], toRemove: [] }

        const res = await call(sync.POST, `http://localhost/api/v1/lists/${LIST}/games/sync`, { listId: LIST }, jsonInit('POST', body))
        const bad = await call(sync.POST, `http://localhost/api/v1/lists/${LIST}/games/sync`, { listId: LIST }, jsonInit('POST', { toAdd: [{ id: 'nope' }], toRemove: [] }))

        expect(res.status).toBe(200)
        expect(syncListGames).toHaveBeenCalledWith(LIST, body, USER.id)
        expect(bad.status).toBe(400)
    })
})

describe('follow', () => {
    it('follows another user as the bearer caller', async () => {
        const res = await call(follow.POST, `http://localhost/api/v1/user/${OTHER}/follow`, { username: OTHER }, { method: 'POST' })

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ following: true })
        expect(followUser).toHaveBeenCalledWith(USER.id, OTHER)
    })

    it('rejects a self-follow and a missing user', async () => {
        const self = await call(follow.POST, `http://localhost/api/v1/user/${USER.id}/follow`, { username: USER.id }, { method: 'POST' })
        userExists.mockResolvedValue(false)
        const missing = await call(follow.POST, `http://localhost/api/v1/user/${OTHER}/follow`, { username: OTHER }, { method: 'POST' })

        expect(self.status).toBe(400)
        expect(missing.status).toBe(404)
        expect(followUser).not.toHaveBeenCalled()
    })

    it('unfollows as the bearer caller', async () => {
        const res = await call(follow.DELETE, `http://localhost/api/v1/user/${OTHER}/follow`, { username: OTHER }, { method: 'DELETE' })

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ following: false })
        expect(unfollowUser).toHaveBeenCalledWith(USER.id, OTHER)
    })
})

describe('profile, avatar, steam, loadout clear', () => {
    it('patches only the bearer user and rejects an empty body', async () => {
        patchAccount.mockResolvedValue({ error: null })

        const res = await call(me.PATCH, 'http://localhost/api/v1/me', {}, jsonInit('PATCH', { username: 'ada', userId: OTHER }))
        const empty = await call(me.PATCH, 'http://localhost/api/v1/me', {}, jsonInit('PATCH', {}))

        expect(res.status).toBe(200)
        expect(patchAccount).toHaveBeenCalledWith(USER.id, { username: 'ada' })
        expect(empty.status).toBe(400)
    })

    it('turns a taken username into invalid_request without the database text', async () => {
        // What patchAccount returns for Drizzle's wrapped PostgresError.
        patchAccount.mockResolvedValue({
            error: writeErrorText(new Error('Failed query: update "users"', {
                cause: { code: '23505', message: 'duplicate key value violates unique constraint "users_username_key"' },
            })),
        })

        const res = await call(me.PATCH, 'http://localhost/api/v1/me', {}, jsonInit('PATCH', { username: 'ada' }))
        const body = await res.json()

        expect(res.status).toBe(400)
        expect(body.error.code).toBe('invalid_request')
        expect(JSON.stringify(body)).not.toContain('users_username_key')
    })

    it('deletes the bearer user\'s account', async () => {
        deleteAccount.mockResolvedValue({ error: null })

        const res = await call(me.DELETE, 'http://localhost/api/v1/me', {}, { method: 'DELETE' })

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
        expect(deleteAccount).toHaveBeenCalledWith(USER.id)
        expect(consumeWriteRateLimit).toHaveBeenCalledWith(USER.id)
        expect(res.headers.get('access-control-allow-origin')).toBe('*')
    })

    it('answers a failed delete with a 500 that names no internals', async () => {
        deleteAccount.mockResolvedValue({ error: 'User not allowed: service role misconfigured' })

        const res = await call(me.DELETE, 'http://localhost/api/v1/me', {}, { method: 'DELETE' })
        const body = await res.json()

        expect(res.status).toBe(500)
        expect(body.error).toEqual({ code: 'internal', message: 'Could not delete the account. Try again.' })
    })

    it('does not delete when the write budget is spent', async () => {
        consumeWriteRateLimit.mockRejectedValueOnce(new ApiError(429, 'rate_limited', 'Too many requests.', { 'Retry-After': '30' }))

        const res = await call(me.DELETE, 'http://localhost/api/v1/me', {}, { method: 'DELETE' })

        expect(res.status).toBe(429)
        expect(deleteAccount).not.toHaveBeenCalled()
    })

    it('clears the caller\'s Read-out', async () => {
        clearLoadoutIdentity.mockResolvedValue({ error: null })

        const res = await call(loadout.DELETE, 'http://localhost/api/v1/me/loadout', {}, { method: 'DELETE' })

        expect(res.status).toBe(200)
        expect(clearLoadoutIdentity).toHaveBeenCalledWith(USER.id)
    })

    it('generates the caller\'s Read-out and returns it', async () => {
        generateReadout.mockResolvedValue({ ok: true, identity: 'You chase hard games.' })

        const res = await call(loadout.POST, 'http://localhost/api/v1/me/loadout', {}, { method: 'POST' })

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ identity: 'You chase hard games.' })
        expect(generateReadout).toHaveBeenCalledWith(USER.id)
        expect(consumeWriteRateLimit).toHaveBeenCalledWith(USER.id)
        expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    })

    it('says how long to wait after a Read-out from the last minute', async () => {
        generateReadout.mockResolvedValue({ ok: false, reason: 'too_soon', retryAfter: 42 })

        const res = await call(loadout.POST, 'http://localhost/api/v1/me/loadout', {}, { method: 'POST' })
        const body = await res.json()

        expect(res.status).toBe(429)
        expect(res.headers.get('Retry-After')).toBe('42')
        expect(body.error).toMatchObject({ code: 'rate_limited', retry_after: 42 })
    })

    it('asks for five ratings before a Read-out', async () => {
        generateReadout.mockResolvedValue({ ok: false, reason: 'not_eligible' })

        const res = await call(loadout.POST, 'http://localhost/api/v1/me/loadout', {}, { method: 'POST' })
        const body = await res.json()

        expect(res.status).toBe(400)
        expect(body.error).toEqual({ code: 'invalid_request', message: 'Rate at least 5 games first.' })
    })

    it('treats an empty generation as a retryable outage, and a failed save as an error', async () => {
        generateReadout.mockResolvedValueOnce({ ok: false, reason: 'generation_failed' })
        const empty = await call(loadout.POST, 'http://localhost/api/v1/me/loadout', {}, { method: 'POST' })
        expect(empty.status).toBe(503)
        expect((await empty.json()).error.code).toBe('unavailable')

        generateReadout.mockResolvedValueOnce({ ok: false, reason: 'save_failed' })
        const unsaved = await call(loadout.POST, 'http://localhost/api/v1/me/loadout', {}, { method: 'POST' })
        expect(unsaved.status).toBe(500)
        expect((await unsaved.json()).error.code).toBe('internal')
    })

    it('does not generate when the write budget is spent', async () => {
        consumeWriteRateLimit.mockRejectedValueOnce(new ApiError(429, 'rate_limited', 'Too many requests.', { 'Retry-After': '30' }))

        const res = await call(loadout.POST, 'http://localhost/api/v1/me/loadout', {}, { method: 'POST' })

        expect(res.status).toBe(429)
        expect(generateReadout).not.toHaveBeenCalled()
    })

    it('mints an upload URL for the bearer user', async () => {
        createPresignedAvatarUploadUrl.mockResolvedValue({ uploadUrl: 'https://upload.example/put', publicUrl: `https://cdn.example/${USER.id}/avatar?v=1` })

        const res = await call(avatarUpload.POST, 'http://localhost/api/v1/me/avatar/upload-url', {}, jsonInit('POST', { contentType: 'image/png', contentLength: 1000 }))

        expect(res.status).toBe(200)
        expect(createPresignedAvatarUploadUrl).toHaveBeenCalledWith(USER.id, 'image/png', 1000)
    })

    it('refuses to save an avatar URL that is not the caller\'s object', async () => {
        process.env.R2_PUBLIC_URL = 'https://cdn.example'
        const evil = await call(avatar.PUT, 'http://localhost/api/v1/me/avatar', {}, jsonInit('PUT', { url: `https://evil.example/${USER.id}/avatar` }))
        const other = await call(avatar.PUT, 'http://localhost/api/v1/me/avatar', {}, jsonInit('PUT', { url: `https://cdn.example/${OTHER}/avatar` }))

        expect(evil.status).toBe(400)
        expect(other.status).toBe(400)
        expect(updateAvatarUrl).not.toHaveBeenCalled()
    })

    it('saves the caller\'s avatar URL', async () => {
        process.env.R2_PUBLIC_URL = 'https://cdn.example'
        updateAvatarUrl.mockResolvedValue(null)

        const res = await call(avatar.PUT, 'http://localhost/api/v1/me/avatar', {}, jsonInit('PUT', { url: `https://cdn.example/${USER.id}/avatar?v=2` }))

        expect(res.status).toBe(200)
        expect(updateAvatarUrl).toHaveBeenCalledWith(USER.id, `https://cdn.example/${USER.id}/avatar?v=2`)
    })

    it('unlinks Steam for the bearer user', async () => {
        const res = await call(steam.DELETE, 'http://localhost/api/v1/me/steam', {}, { method: 'DELETE' })

        expect(res.status).toBe(204)
        expect(unlinkSteamAccount).toHaveBeenCalledWith(USER.id)
    })

    it('imports a Steam library for the bearer user and surfaces a player-facing input error', async () => {
        importConfirmedSteamLibrary.mockResolvedValue(undefined)
        const entry = {
            gameId: GAME, playtimeSelected: 3, status: 'playing', selected: true, coverImageUrl: null,
            gameName: 'Hades', gameDeveloper: 'Supergiant', gameReleased: null, completedAllAchievements: false,
        }

        const res = await call(steamImport.POST, 'http://localhost/api/v1/me/library/import', {}, jsonInit('POST', [entry]))
        importConfirmedSteamLibrary.mockRejectedValue(new SteamImportInputError('Choose games from your Steam library and try again.'))
        const bad = await call(steamImport.POST, 'http://localhost/api/v1/me/library/import', {}, jsonInit('POST', [entry]))

        expect(res.status).toBe(200)
        expect(importConfirmedSteamLibrary).toHaveBeenCalledWith(USER.id, [entry])
        expect(bad.status).toBe(400)
        expect((await bad.json()).error.message).toMatch(/Steam library/)
    })
})
