import { beforeEach, describe, expect, it, vi } from 'vitest'

// Seam: the Drizzle db client and the Expo push HTTP boundary. Both are
// mocked; nothing here makes a real network call or touches a database.
// drizzle-orm's own eq/and/inArray are pure query-builder functions (no I/O)
// and run for real, same as test/lib/loaders/list-like-privacy.test.ts.

const state = vi.hoisted(() => ({
    tokens: [] as { token: string }[],
    excessTokenIds: [] as { id: string }[],
    upserted: [] as { userId: string, expoPushToken: string, platform: string }[],
    upsertConfig: null as { setWhere?: unknown } | null,
    deleteCalls: 0,
}))

vi.mock('@/lib/db', () => ({
    db: {
        // registerPushToken's prune step selects { id } to find excess rows;
        // sendPushNotification selects { token }. Dispatch on that shape so
        // one mock serves both without the two sharing an array.
        select: (fields?: Record<string, unknown>) => ({
            from: () => ({
                where: () => {
                    const rows = fields && 'id' in fields ? state.excessTokenIds : state.tokens
                    return {
                        then: (resolve: (v: unknown[]) => void) => resolve(rows),
                        orderBy: () => ({ offset: async () => rows }),
                    }
                },
            }),
        }),
        insert: () => ({
            values: (row: { userId: string, expoPushToken: string, platform: string }) => ({
                onConflictDoUpdate: async (config: { setWhere?: unknown }) => {
                    state.upserted.push(row)
                    state.upsertConfig = config
                },
            }),
        }),
        delete: () => ({
            where: async () => {
                state.deleteCalls += 1
            },
        }),
    },
}))

vi.mock('@/lib/rate-limit', () => ({ consumeApiRateLimit: vi.fn() }))

function jsonResponse(body: unknown, init?: ResponseInit) {
    return new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
        ...init,
    })
}

import { consumeApiRateLimit } from '@/lib/rate-limit'
import { ApiError } from '@/lib/api'
import { notifyOncePerWindow, registerPushToken, sendPushNotification, unregisterPushToken } from '@/lib/queries/push'

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const consumeApiRateLimitMock = vi.mocked(consumeApiRateLimit)

beforeEach(() => {
    state.tokens = []
    state.excessTokenIds = []
    state.upserted = []
    state.upsertConfig = null
    state.deleteCalls = 0
    consumeApiRateLimitMock.mockReset()
})

describe('registerPushToken', () => {
    it('upserts the token for this user and platform', async () => {
        await registerPushToken(USER, 'ExponentPushToken[abc]', 'ios')
        expect(state.upserted).toEqual([{ userId: USER, expoPushToken: 'ExponentPushToken[abc]', platform: 'ios' }])
    })

    it('only reassigns a conflicting token when the other owner has gone idle', async () => {
        await registerPushToken(USER, 'ExponentPushToken[abc]', 'ios')
        expect(state.upsertConfig?.setWhere).toBeDefined()
    })

    it('prunes rows beyond the per-user cap after registering', async () => {
        state.excessTokenIds = [{ id: 'old-1' }, { id: 'old-2' }]

        await registerPushToken(USER, 'ExponentPushToken[abc]', 'ios')

        expect(state.deleteCalls).toBe(1)
    })

    it('does not delete anything when the user is under the cap', async () => {
        state.excessTokenIds = []

        await registerPushToken(USER, 'ExponentPushToken[abc]', 'ios')

        expect(state.deleteCalls).toBe(0)
    })
})

describe('notifyOncePerWindow', () => {
    it('returns true and lets the caller send when the bucket has budget', async () => {
        consumeApiRateLimitMock.mockResolvedValue(undefined)

        await expect(notifyOncePerWindow('follow:a:b')).resolves.toBe(true)
        expect(consumeApiRateLimitMock).toHaveBeenCalledWith('notify:follow:a:b', 1, 60 * 60)
    })

    it('returns false without throwing when the window is already spent', async () => {
        consumeApiRateLimitMock.mockRejectedValue(new ApiError(429, 'rate_limited', 'Too many requests.'))

        await expect(notifyOncePerWindow('follow:a:b')).resolves.toBe(false)
    })

    it('rethrows a non-rate-limit error', async () => {
        consumeApiRateLimitMock.mockRejectedValue(new Error('db offline'))

        await expect(notifyOncePerWindow('follow:a:b')).rejects.toThrow('db offline')
    })
})

describe('unregisterPushToken', () => {
    it('deletes the row for that token and user', async () => {
        await unregisterPushToken(USER, 'ExponentPushToken[abc]')
        expect(state.deleteCalls).toBe(1)
    })
})

describe('sendPushNotification', () => {
    it('does nothing when the user has no registered device', async () => {
        state.tokens = []
        vi.stubGlobal('fetch', vi.fn())

        await sendPushNotification(USER, { title: 'Hi', body: 'There' })

        expect(fetch).not.toHaveBeenCalled()
    })

    it('sends one ticket per token, with the given title, body, and data', async () => {
        state.tokens = [{ token: 'ExponentPushToken[a]' }, { token: 'ExponentPushToken[b]' }]
        const fetchMock = vi.fn(async () => jsonResponse({ data: [{ status: 'ok' }, { status: 'ok' }] }))
        vi.stubGlobal('fetch', fetchMock)

        await sendPushNotification(USER, { title: 'New follower', body: 'ada started following you', data: { url: '/user/ada' } })

        expect(fetchMock).toHaveBeenCalledTimes(1)
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
        expect(url).toBe('https://exp.host/--/api/v2/push/send')
        const sent = JSON.parse(init.body as string)
        expect(sent).toEqual([
            { to: 'ExponentPushToken[a]', title: 'New follower', body: 'ada started following you', data: { url: '/user/ada' } },
            { to: 'ExponentPushToken[b]', title: 'New follower', body: 'ada started following you', data: { url: '/user/ada' } },
        ])
        expect(state.deleteCalls).toBe(0)
    })

    it('prunes a token Expo reports as no longer registered', async () => {
        state.tokens = [{ token: 'ExponentPushToken[live]' }, { token: 'ExponentPushToken[dead]' }]
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
            data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }],
        })))

        await sendPushNotification(USER, { title: 'Hi', body: 'There' })

        expect(state.deleteCalls).toBe(1)
    })

    it('never throws when the network call itself fails', async () => {
        state.tokens = [{ token: 'ExponentPushToken[a]' }]
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))

        await expect(sendPushNotification(USER, { title: 'Hi', body: 'There' })).resolves.toBeUndefined()
    })

    it('never throws when Expo responds with an error status', async () => {
        state.tokens = [{ token: 'ExponentPushToken[a]' }]
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, { status: 500 })))

        await expect(sendPushNotification(USER, { title: 'Hi', body: 'There' })).resolves.toBeUndefined()
    })
})
