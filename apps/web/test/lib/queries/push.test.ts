import { beforeEach, describe, expect, it, vi } from 'vitest'

// Seam: the Drizzle db client and the Expo push HTTP boundary. Both are
// mocked; nothing here makes a real network call or touches a database.
// drizzle-orm's own eq/and/inArray are pure query-builder functions (no I/O)
// and run for real, same as test/lib/loaders/list-like-privacy.test.ts.

const state = vi.hoisted(() => ({
    tokens: [] as { token: string }[],
    upserted: [] as { userId: string, expoPushToken: string, platform: string }[],
    deleteCalls: 0,
}))

vi.mock('@/lib/db', () => ({
    db: {
        select: () => ({
            from: () => ({
                where: async () => state.tokens,
            }),
        }),
        insert: () => ({
            values: (row: { userId: string, expoPushToken: string, platform: string }) => ({
                onConflictDoUpdate: async () => {
                    state.upserted.push(row)
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

function jsonResponse(body: unknown, init?: ResponseInit) {
    return new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
        ...init,
    })
}

import { registerPushToken, sendPushNotification, unregisterPushToken } from '@/lib/queries/push'

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

beforeEach(() => {
    state.tokens = []
    state.upserted = []
    state.deleteCalls = 0
})

describe('registerPushToken', () => {
    it('upserts the token for this user and platform', async () => {
        await registerPushToken(USER, 'ExponentPushToken[abc]', 'ios')
        expect(state.upserted).toEqual([{ userId: USER, expoPushToken: 'ExponentPushToken[abc]', platform: 'ios' }])
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
