import { beforeEach, describe, expect, it, vi } from 'vitest'

// likeList's ownership/privacy rules have their own test
// (test/lib/loaders/list-like-privacy.test.ts). This file is about the one
// thing that rides along with a genuinely new like: notifying the list's
// owner, with the liker's name and never the liker's own list.

const state = vi.hoisted(() => ({
    // One db.select(...).from(...).where() call per queue entry, in order:
    // the list row, then (only on a new like) the liker's username, then the
    // owner's username.
    selectQueue: [] as unknown[][],
    inserted: 0,
    insertReturns: [{ userId: 'viewer' }] as { userId: string }[],
}))

const { sendPushNotification } = vi.hoisted(() => ({ sendPushNotification: vi.fn() }))

vi.mock('@/lib/db', () => ({
    db: {
        select: () => ({
            from: () => ({
                where: () => ({
                    limit: async () => state.selectQueue.shift() ?? [],
                }),
            }),
        }),
        insert: () => ({
            values: () => ({
                onConflictDoNothing: () => ({
                    returning: async () => {
                        state.inserted += 1
                        return state.insertReturns
                    },
                }),
            }),
        }),
    },
}))

vi.mock('@/lib/queries/push', () => ({ sendPushNotification }))

import { likeList } from '@/lib/queries/list'

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const VIEWER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const LIST = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
    state.selectQueue = []
    state.inserted = 0
    state.insertReturns = [{ userId: VIEWER }]
    sendPushNotification.mockReset()
})

describe('likeList notifications', () => {
    it("notifies the list's owner, naming the liker, on a genuinely new like", async () => {
        state.selectQueue = [
            [{ id: LIST, name: 'Roguelikes', isPublic: true, userId: OWNER }],
            [{ username: 'ada' }],
            [{ username: 'owner_handle' }],
        ]

        const result = await likeList(LIST, VIEWER)

        expect(result).toEqual({ error: null })
        expect(sendPushNotification).toHaveBeenCalledWith(OWNER, {
            title: 'List liked',
            body: 'ada liked your list "Roguelikes"',
            data: { url: '/user/owner_handle/lists/22222222-2222-4222-8222-222222222222' },
        })
    })

    it('does not notify again when the like already existed (a retry)', async () => {
        state.selectQueue = [[{ id: LIST, name: 'Roguelikes', isPublic: true, userId: OWNER }]]
        state.insertReturns = [] // onConflictDoNothing: no row inserted

        const result = await likeList(LIST, VIEWER)

        expect(result).toEqual({ error: null })
        expect(sendPushNotification).not.toHaveBeenCalled()
    })
})
