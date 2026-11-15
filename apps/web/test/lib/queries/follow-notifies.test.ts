import { beforeEach, describe, expect, it, vi } from 'vitest'

// followUser's write itself (idempotent insert) is exercised through the API
// route tests. This file is about the one thing that rides along with a
// genuinely new follow: notifying the followed player, naming the follower.
// It also covers the blocked-parties no-op, and the pair-scoped advisory
// lock that serializes followUser against a concurrent blockUser for the
// same pair.
//
// followUser's transaction covers only the lock, the block re-check, and the
// insert; the notification path (notifyOncePerWindow, the follower-username
// lookup, sendPushNotification) runs afterward, outside any transaction, on
// the top-level `db` — so the mock below gives the transaction's `tx` its
// own `select`/`insert`, separate from `db`'s own top-level `select`.

const state = vi.hoisted(() => ({
    callOrder: [] as string[],
    txBlockCheckResult: [] as unknown[],
    txInsertReturns: [] as { followerId: string }[],
    followerLookupResult: [] as { username: string }[],
}))

const { sendPushNotification, notifyOncePerWindow } = vi.hoisted(() => ({
    sendPushNotification: vi.fn(),
    notifyOncePerWindow: vi.fn(async () => true),
}))

const insertSpy = vi.hoisted(() => vi.fn())
const executeSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db', () => ({
    db: {
        transaction: async (run: (tx: unknown) => Promise<unknown>) => {
            const tx = {
                execute: async (...args: unknown[]) => {
                    state.callOrder.push('execute')
                    executeSpy(...args)
                },
                select: () => ({
                    from: () => ({
                        where: () => ({
                            limit: async () => {
                                state.callOrder.push('select')
                                return state.txBlockCheckResult
                            },
                        }),
                    }),
                }),
                insert: (...args: unknown[]) => {
                    insertSpy(...args)
                    return {
                        values: () => ({
                            onConflictDoNothing: () => ({
                                returning: async () => {
                                    state.callOrder.push('insert')
                                    return state.txInsertReturns
                                },
                            }),
                        }),
                    }
                },
            }
            const result = await run(tx)
            state.callOrder.push('commit')
            return result
        },
        select: () => ({
            from: () => ({
                where: () => ({
                    limit: async () => {
                        state.callOrder.push('follower-lookup')
                        return state.followerLookupResult
                    },
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
    state.callOrder = []
    state.txBlockCheckResult = []
    state.txInsertReturns = []
    state.followerLookupResult = []
    insertSpy.mockReset()
    executeSpy.mockReset()
    sendPushNotification.mockReset()
    notifyOncePerWindow.mockReset()
    notifyOncePerWindow.mockResolvedValue(true)
})

describe('followUser notifications', () => {
    it('notifies the followed player, naming the follower, on a new follow', async () => {
        state.txBlockCheckResult = [] // not blocked
        state.txInsertReturns = [{ followerId: FOLLOWER }]
        state.followerLookupResult = [{ username: 'ada' }]

        await followUser(FOLLOWER, FOLLOWING)

        expect(sendPushNotification).toHaveBeenCalledWith(FOLLOWING, {
            title: 'New follower',
            body: 'ada started following you',
            data: { url: '/user/ada' },
        })
    })

    it('does not notify again when the follow already existed (a retry)', async () => {
        state.txBlockCheckResult = [] // not blocked
        state.txInsertReturns = [] // onConflictDoNothing: no row inserted

        await followUser(FOLLOWER, FOLLOWING)

        expect(sendPushNotification).not.toHaveBeenCalled()
    })

    it('skips the send when the per-pair notification window is still open', async () => {
        state.txBlockCheckResult = [] // not blocked
        state.txInsertReturns = [{ followerId: FOLLOWER }]
        notifyOncePerWindow.mockResolvedValue(false)

        await followUser(FOLLOWER, FOLLOWING)

        expect(notifyOncePerWindow).toHaveBeenCalledWith(`follow:${FOLLOWER}:${FOLLOWING}`)
        expect(sendPushNotification).not.toHaveBeenCalled()
    })

    it('is a silent no-op between blocked parties, in either direction', async () => {
        state.txBlockCheckResult = [{ blockerId: FOLLOWER }] // blocked

        await followUser(FOLLOWER, FOLLOWING)
        expect(insertSpy).not.toHaveBeenCalled()

        await followUser(FOLLOWING, FOLLOWER)
        expect(insertSpy).not.toHaveBeenCalled()

        expect(notifyOncePerWindow).not.toHaveBeenCalled()
        expect(sendPushNotification).not.toHaveBeenCalled()
    })

    it('takes the pair-scoped advisory lock first, inside the transaction, before the block check or insert', async () => {
        state.txBlockCheckResult = [] // not blocked
        state.txInsertReturns = [{ followerId: FOLLOWER }]
        state.followerLookupResult = [{ username: 'ada' }]

        await followUser(FOLLOWER, FOLLOWING)

        expect(executeSpy).toHaveBeenCalledTimes(1)
        expect(state.callOrder[0]).toBe('execute')
        expect(state.callOrder.indexOf('execute')).toBeLessThan(state.callOrder.indexOf('select'))
        expect(state.callOrder.indexOf('select')).toBeLessThan(state.callOrder.indexOf('insert'))
    })

    it('commits the transaction (lock, block check, insert) before running any notification', async () => {
        state.txBlockCheckResult = [] // not blocked
        state.txInsertReturns = [{ followerId: FOLLOWER }]
        state.followerLookupResult = [{ username: 'ada' }]

        await followUser(FOLLOWER, FOLLOWING)

        expect(state.callOrder).toEqual(['execute', 'select', 'insert', 'commit', 'follower-lookup'])
        expect(sendPushNotification).toHaveBeenCalled()
    })
})
