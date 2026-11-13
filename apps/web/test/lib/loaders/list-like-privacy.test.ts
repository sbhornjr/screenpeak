import { beforeEach, describe, expect, it, vi } from 'vitest'

// Sits beside the private-list case in read-pages.test.ts. That file mocks
// the list queries, so the privacy check on likeList is asserted here.

const state = vi.hoisted(() => ({
    rows: [] as { id: string, isPublic: boolean, userId: string }[],
    inserted: 0,
}))

vi.mock('@/lib/db', () => ({
    db: {
        select: () => ({
            from: () => ({
                where: () => ({
                    limit: async () => state.rows,
                }),
            }),
        }),
        insert: () => ({
            values: () => ({
                onConflictDoNothing: () => ({
                    returning: async () => {
                        state.inserted += 1
                        return [{ userId: 'mock' }]
                    },
                }),
            }),
        }),
    },
}))

// The notification side effect has its own test; this file is about
// likeList's ownership/privacy rules, so it never sends a real push.
vi.mock('@/lib/queries/push', () => ({ sendPushNotification: vi.fn() }))

import { likeList } from '@/lib/queries/list'

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const VIEWER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const LIST = '22222222-2222-4222-8222-222222222222'

describe('likeList privacy', () => {
    beforeEach(() => {
        state.rows = []
        state.inserted = 0
    })

    it('treats someone else\'s private list as missing and writes no like', async () => {
        state.rows = [{ id: LIST, isPublic: false, userId: OWNER }]

        const result = await likeList(LIST, VIEWER)

        expect(result).toEqual({ error: 'List not found' })
        expect(state.inserted).toBe(0)
    })

    it('rejects the owner liking their own list and writes no like', async () => {
        state.rows = [{ id: LIST, isPublic: false, userId: OWNER }]

        const result = await likeList(LIST, OWNER)

        expect(result).toEqual({ error: 'Cannot like your own list' })
        expect(state.inserted).toBe(0)
    })

    it('lets someone else like a public list', async () => {
        state.rows = [{ id: LIST, isPublic: true, userId: OWNER }]

        const result = await likeList(LIST, VIEWER)

        expect(result).toEqual({ error: null })
        expect(state.inserted).toBe(1)
    })
})
