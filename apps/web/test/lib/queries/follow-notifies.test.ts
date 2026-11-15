import { beforeEach, describe, expect, it, vi } from 'vitest'

// followUser's write itself (idempotent insert) is exercised through the API
// route tests. This file is about the one thing that rides along with a
// genuinely new follow: notifying the followed player, naming the follower.
// It also covers the blocked-parties no-op, since that check runs inline in
// followUser before anything else, and the pair-scoped advisory lock that
// serializes followUser against a concurrent blockUser for the same pair.

const state = vi.hoisted(() => ({
    callOrder: [] as string[],
    insertReturns: [] as { followerId: string }[],
    // One tx.select(...).from(...).where().limit() call per queue entry, in
    // order: the in-transaction block check first, then (only past that, and
    // only on a genuinely new follow that clears the notification window)
    // the follower's username.
    selectQueue: [] as unknown[][],
}))

const { sendPushNotification, notifyOncePerWindow } = vi.hoisted(() => ({
    sendPushNotification: vi.fn(),
    notifyOncePerWindow: vi.fn(async () => true),
}))

const insertSpy = vi.hoisted(() => vi.fn())
const executeSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db', () => ({
    db: {
        transaction: async (run: (tx: unknown) => Promise<void>) => {
            const tx = {
                execute: async (...args: unknown[]) => {
                    state.callOrder.push('execute')
                    executeSpy(...args)
                },
                insert: (...args: unknown[]) => {
                    state.callOrder.push('insert')
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
                            limit: async () => {
                                state.callOrder.push('select')
                                return state.selectQueue.shift() ?? []
                            },
                        }),
                    }),
                }),
            }
            return run(tx)
        },
    },
}))

vi.mock('@/lib/queries/push', () => ({ sendPushNotification, notifyOncePerWindow }))

import { followUser } from '@/lib/queries/user'

const FOLLOWER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const FOLLOWING = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

beforeEach(() => {
    state.callOrder = []
    state.insertReturns = []
    state.selectQueue = []
    insertSpy.mockReset()
    executeSpy.mockReset()
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

        expect(notifyOncePerWindow).not.toHaveBeenCalled()
        expect(sendPushNotification).not.toHaveBeenCalled()
    })

    it('takes the pair-scoped advisory lock first, inside the transaction, before the block check or insert', async () => {
        state.selectQueue = [[], [{ username: 'ada' }]] // not blocked, then follower lookup
        state.insertReturns = [{ followerId: FOLLOWER }]

        await followUser(FOLLOWER, FOLLOWING)

        expect(executeSpy).toHaveBeenCalledTimes(1)
        expect(state.callOrder[0]).toBe('execute')
        expect(state.callOrder.indexOf('execute')).toBeLessThan(state.callOrder.indexOf('select'))
        expect(state.callOrder.indexOf('execute')).toBeLessThan(state.callOrder.indexOf('insert'))
    })
})
