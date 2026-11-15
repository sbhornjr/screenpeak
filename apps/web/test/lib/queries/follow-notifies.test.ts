import { beforeEach, describe, expect, it, vi } from 'vitest'

// followUser's write itself (idempotent insert) is exercised through the API
// route tests. This file is about the one thing that rides along with a
// genuinely new follow: notifying the followed player, naming the follower.
// It also covers the blocked-parties no-op, since that check runs inline in
// followUser before anything else.

const state = vi.hoisted(() => ({
    insertReturns: [] as { followerId: string }[],
    // One db.select(...).from(...).where().limit() call per queue entry, in
    // order: isBlockedEitherWay's check first, then (only past that, and only
    // on a genuinely new follow that clears the notification window) the
    // follower's username.
    selectQueue: [] as unknown[][],
}))

const { sendPushNotification, notifyOncePerWindow } = vi.hoisted(() => ({
    sendPushNotification: vi.fn(),
    notifyOncePerWindow: vi.fn(async () => true),
}))

const insertSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db', () => ({
    db: {
        insert: (...args: unknown[]) => {
            insertSpy(...args)
            return {
                values: () => ({
                    onConflictDoNothing: () => ({
                        returning: async () => state.insertReturns,
                    }),
                }),
            }
        },
        select: () => ({
            from: () => ({
                where: () => ({
                    limit: async () => state.selectQueue.shift() ?? [],
                }),
            }),
        }),
    },
}))

vi.mock('@/lib/queries/push', () => ({ sendPushNotification, notifyOncePerWindow }))

import { followUser } from '@/lib/queries/user'

const FOLLOWER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const FOLLOWING = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

beforeEach(() => {
    state.insertReturns = []
    state.selectQueue = []
    insertSpy.mockReset()
    sendPushNotification.mockReset()
    notifyOncePerWindow.mockReset()
    notifyOncePerWindow.mockResolvedValue(true)
})

describe('followUser notifications', () => {
    it('notifies the followed player, naming the follower, on a new follow', async () => {
        state.selectQueue = [[], [{ username: 'ada' }]] // not blocked, then follower lookup
        state.insertReturns = [{ followerId: FOLLOWER }]

        await followUser(FOLLOWER, FOLLOWING)

        expect(sendPushNotification).toHaveBeenCalledWith(FOLLOWING, {
            title: 'New follower',
            body: 'ada started following you',
            data: { url: '/user/ada' },
        })
    })

    it('does not notify again when the follow already existed (a retry)', async () => {
        state.selectQueue = [[]] // not blocked
        state.insertReturns = [] // onConflictDoNothing: no row inserted

        await followUser(FOLLOWER, FOLLOWING)

        expect(sendPushNotification).not.toHaveBeenCalled()
    })

    it('skips the send when the per-pair notification window is still open', async () => {
        state.selectQueue = [[]] // not blocked
        state.insertReturns = [{ followerId: FOLLOWER }]
        notifyOncePerWindow.mockResolvedValue(false)

        await followUser(FOLLOWER, FOLLOWING)

        expect(notifyOncePerWindow).toHaveBeenCalledWith(`follow:${FOLLOWER}:${FOLLOWING}`)
        expect(sendPushNotification).not.toHaveBeenCalled()
    })

    it('is a silent no-op between blocked parties, in either direction', async () => {
        state.selectQueue = [[{ blockerId: FOLLOWER }], [{ blockerId: FOLLOWER }]] // blocked, both directions

        await followUser(FOLLOWER, FOLLOWING)
        expect(insertSpy).not.toHaveBeenCalled()

        await followUser(FOLLOWING, FOLLOWER)
        expect(insertSpy).not.toHaveBeenCalled()

        expect(sendPushNotification).not.toHaveBeenCalled()
    })
})
