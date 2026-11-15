import { beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq, or } from 'drizzle-orm'
import { blocks, follows, users } from '@/db/schema'

const state = vi.hoisted(() => ({
    callOrder: [] as string[],
    insertCalls: [] as { table: unknown; values: unknown }[],
    txDeleteCalls: [] as { table: unknown; where: unknown }[],
    txExecuteCalls: [] as unknown[],
    // followUser's path through this same transaction mock (used only by the
    // advisory-lock-key test below, which needs both blockUser and followUser
    // runnable against one mocked db.transaction).
    txBlockCheckResult: [] as unknown[],
    txInsertReturns: [] as { followerId: string }[],
    topDeleteCalls: [] as { table: unknown; where: unknown }[],
    isBlockedWhere: undefined as unknown,
    isBlockedResult: [] as unknown[],
    blockedUsersJoinTable: undefined as unknown,
    blockedUsersJoinOn: undefined as unknown,
    blockedUsersWhere: undefined as unknown,
    blockedUsersOrderBy: undefined as unknown,
    blockedUsersResult: [] as unknown[],
}))

// Pulls the raw lock-key string out of a captured `tx.execute(sql`select
// pg_advisory_xact_lock(hashtextextended(${key}, 0))`)` call. drizzle-orm's
// `sql` template interpolates a plain string argument directly into
// `queryChunks` (not wrapped), so the key is the one non-StringChunk entry.
function extractLockKey(query: unknown): string {
    const chunks = (query as { queryChunks: unknown[] }).queryChunks
    const key = chunks.find((chunk) => typeof chunk === 'string')
    if (typeof key !== 'string') throw new Error('lock key not found in captured query')
    return key
}

vi.mock('@/lib/db', () => ({
    db: {
        transaction: async (run: (tx: unknown) => Promise<unknown>) => {
            const tx = {
                execute: async (query: unknown) => {
                    state.callOrder.push('execute')
                    state.txExecuteCalls.push(query)
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
                insert: (table: unknown) => ({
                    values: (values: unknown) => ({
                        onConflictDoNothing: () => {
                            state.callOrder.push('insert')
                            state.insertCalls.push({ table, values })
                            return { returning: async () => state.txInsertReturns }
                        },
                    }),
                }),
                delete: (table: unknown) => ({
                    where: async (where: unknown) => {
                        state.callOrder.push('delete')
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
                where: (where: unknown) => {
                    state.isBlockedWhere = where
                    return { limit: async () => state.isBlockedResult }
                },
                innerJoin: (joinTable: unknown, on: unknown) => {
                    state.blockedUsersJoinTable = joinTable
                    state.blockedUsersJoinOn = on
                    return {
                        where: (where: unknown) => {
                            state.blockedUsersWhere = where
                            return {
                                orderBy: async (...orderArgs: unknown[]) => {
                                    state.blockedUsersOrderBy = orderArgs
                                    return state.blockedUsersResult
                                },
                            }
                        },
                    }
                },
            }),
        }),
    },
}))

import { blockUser, unblockUser, isBlockedEitherWay, getBlockedUsers, followUser } from '@/lib/queries/user'

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

beforeEach(() => {
    state.callOrder = []
    state.insertCalls = []
    state.txDeleteCalls = []
    state.txExecuteCalls = []
    state.txBlockCheckResult = []
    state.txInsertReturns = []
    state.topDeleteCalls = []
    state.isBlockedWhere = undefined
    state.isBlockedResult = []
    state.blockedUsersJoinTable = undefined
    state.blockedUsersJoinOn = undefined
    state.blockedUsersWhere = undefined
    state.blockedUsersOrderBy = undefined
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

    it('takes the pair-scoped advisory lock first, inside the transaction, before the insert or delete', async () => {
        await blockUser(A, B)

        expect(state.txExecuteCalls).toHaveLength(1)
        expect(state.callOrder).toEqual(['execute', 'insert', 'delete'])
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
    it('checks both directions regardless of which direction the block was made', async () => {
        state.isBlockedResult = [{ blockerId: A }]

        expect(await isBlockedEitherWay(A, B)).toBe(true)
        // Pins the actual predicate: this would fail if the implementation
        // checked only one direction instead of (A,B) or (B,A).
        expect(state.isBlockedWhere).toEqual(
            or(
                and(eq(blocks.blockerId, A), eq(blocks.blockedId, B)),
                and(eq(blocks.blockerId, B), eq(blocks.blockedId, A)),
            ),
        )

        expect(await isBlockedEitherWay(B, A)).toBe(true)
        expect(state.isBlockedWhere).toEqual(
            or(
                and(eq(blocks.blockerId, B), eq(blocks.blockedId, A)),
                and(eq(blocks.blockerId, A), eq(blocks.blockedId, B)),
            ),
        )
    })

    it('is false when no block row exists either way', async () => {
        state.isBlockedResult = []

        expect(await isBlockedEitherWay(A, B)).toBe(false)
    })
})

describe('advisory lock key', () => {
    it('is order-independent: blockUser(A,B) and followUser(B,A) take the same lock', async () => {
        await blockUser(A, B)
        expect(state.txExecuteCalls).toHaveLength(1)
        const keyFromBlock = extractLockKey(state.txExecuteCalls[0])

        state.txExecuteCalls = []
        state.txBlockCheckResult = [{ blockerId: B }] // blocked — short-circuits right after the lock,
        // so this exercises only the lock call, never the real (unmocked) push module.

        await followUser(B, A)
        expect(state.txExecuteCalls).toHaveLength(1)
        const keyFromFollow = extractLockKey(state.txExecuteCalls[0])

        expect(keyFromFollow).toBe(keyFromBlock)
    })
})

describe('getBlockedUsers', () => {
    it("returns the blocker's blocked users, not who blocked them, ordered by username", async () => {
        state.blockedUsersResult = [{ id: B, username: 'blocked_guy', avatar_url: null }]

        const result = await getBlockedUsers(A)

        expect(result).toEqual([{ id: B, username: 'blocked_guy', avatar_url: null }])
        // Joins users on blocks.blockedId (who A blocked) — not blocks.blockerId
        // (who blocked A) — and filters by blocks.blockerId = A, not blockedId.
        expect(state.blockedUsersJoinTable).toBe(users)
        expect(state.blockedUsersJoinOn).toEqual(eq(users.id, blocks.blockedId))
        expect(state.blockedUsersWhere).toEqual(eq(blocks.blockerId, A))
        expect(state.blockedUsersOrderBy).toEqual([users.username, users.id])
    })
})
