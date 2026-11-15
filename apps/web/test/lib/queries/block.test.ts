import { beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq, or } from 'drizzle-orm'
import { blocks, follows } from '@/db/schema'

const state = vi.hoisted(() => ({
    insertCalls: [] as { table: unknown; values: unknown }[],
    txDeleteCalls: [] as { table: unknown; where: unknown }[],
    topDeleteCalls: [] as { table: unknown; where: unknown }[],
    isBlockedResult: [] as unknown[],
    blockedUsersResult: [] as unknown[],
}))

vi.mock('@/lib/db', () => ({
    db: {
        transaction: async (run: (tx: unknown) => Promise<void>) => {
            const tx = {
                insert: (table: unknown) => ({
                    values: (values: unknown) => ({
                        onConflictDoNothing: async () => {
                            state.insertCalls.push({ table, values })
                        },
                    }),
                }),
                delete: (table: unknown) => ({
                    where: async (where: unknown) => {
                        state.txDeleteCalls.push({ table, where })
                    },
                }),
            }
            return run(tx)
        },
        delete: (table: unknown) => ({
            where: async (where: unknown) => {
                state.topDeleteCalls.push({ table, where })
            },
        }),
        select: () => ({
            from: () => ({
                where: () => ({
                    limit: async () => state.isBlockedResult,
                }),
                innerJoin: () => ({
                    where: async () => state.blockedUsersResult,
                }),
            }),
        }),
    },
}))

import { blockUser, unblockUser, isBlockedEitherWay, getBlockedUsers } from '@/lib/queries/user'

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

beforeEach(() => {
    state.insertCalls = []
    state.txDeleteCalls = []
    state.topDeleteCalls = []
    state.isBlockedResult = []
    state.blockedUsersResult = []
})

describe('blockUser', () => {
    it('inserts the block row and removes any existing follow in either direction, in one transaction', async () => {
        await blockUser(A, B)

        expect(state.insertCalls).toHaveLength(1)
        expect(state.insertCalls[0].table).toBe(blocks)
        expect(state.insertCalls[0].values).toEqual({ blockerId: A, blockedId: B })

        expect(state.txDeleteCalls).toHaveLength(1)
        expect(state.txDeleteCalls[0].table).toBe(follows)
        expect(state.txDeleteCalls[0].where).toEqual(
            or(
                and(eq(follows.followerId, A), eq(follows.followingId, B)),
                and(eq(follows.followerId, B), eq(follows.followingId, A)),
            ),
        )
    })
})

describe('unblockUser', () => {
    it('deletes only the block row scoped to that blocker', async () => {
        await unblockUser(A, B)

        expect(state.topDeleteCalls).toHaveLength(1)
        expect(state.topDeleteCalls[0].table).toBe(blocks)
        expect(state.topDeleteCalls[0].where).toEqual(
            and(eq(blocks.blockerId, A), eq(blocks.blockedId, B)),
        )
    })
})

describe('isBlockedEitherWay', () => {
    it('is true whichever direction the block was made', async () => {
        state.isBlockedResult = [{ blockerId: A }]

        expect(await isBlockedEitherWay(A, B)).toBe(true)
        expect(await isBlockedEitherWay(B, A)).toBe(true)
    })

    it('is false when no block row exists either way', async () => {
        state.isBlockedResult = []

        expect(await isBlockedEitherWay(A, B)).toBe(false)
    })
})

describe('getBlockedUsers', () => {
    it("returns the blocker's blocked users, not who blocked them", async () => {
        state.blockedUsersResult = [{ id: B, username: 'blocked_guy', avatar_url: null }]

        const result = await getBlockedUsers(A)

        expect(result).toEqual([{ id: B, username: 'blocked_guy', avatar_url: null }])
    })
})
