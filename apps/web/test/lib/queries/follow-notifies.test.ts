import { beforeEach, describe, expect, it, vi } from 'vitest'

// followUser's write itself (idempotent insert) is exercised through the API
// route tests. This file is about the one thing that rides along with a
// genuinely new follow: notifying the followed player, naming the follower.

const state = vi.hoisted(() => ({
    insertReturns: [] as { followerId: string }[],
    selectReturns: [] as { username: string }[],
}))

const { sendPushNotification } = vi.hoisted(() => ({ sendPushNotification: vi.fn() }))

vi.mock('@/lib/db', () => ({
    db: {
        insert: () => ({
            values: () => ({
                onConflictDoNothing: () => ({
                    returning: async () => state.insertReturns,
                }),
            }),
        }),
        select: () => ({
            from: () => ({
                where: () => ({
                    limit: async () => state.selectReturns,
                }),
            }),
        }),
    },
}))

vi.mock('@/lib/queries/push', () => ({ sendPushNotification }))

import { followUser } from '@/lib/queries/user'

const FOLLOWER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const FOLLOWING = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

beforeEach(() => {
    state.insertReturns = []
    state.selectReturns = []
    sendPushNotification.mockReset()
})

describe('followUser notifications', () => {
    it('notifies the followed player, naming the follower, on a new follow', async () => {
        state.insertReturns = [{ followerId: FOLLOWER }]
        state.selectReturns = [{ username: 'ada' }]

        await followUser(FOLLOWER, FOLLOWING)

        expect(sendPushNotification).toHaveBeenCalledWith(FOLLOWING, {
            title: 'New follower',
            body: 'ada started following you',
            data: { url: '/user/ada' },
        })
    })

    it('does not notify again when the follow already existed (a retry)', async () => {
        state.insertReturns = [] // onConflictDoNothing: no row inserted

        await followUser(FOLLOWER, FOLLOWING)

        expect(sendPushNotification).not.toHaveBeenCalled()
    })
})
