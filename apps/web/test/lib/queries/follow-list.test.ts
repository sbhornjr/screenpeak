import { describe, expect, it, vi } from 'vitest'

const execute = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db', () => ({ db: { execute } }))

import { getFollowerProfiles, getFollowingProfiles } from '@/lib/queries/user'

// No manual mockReset/mockClear here: apps/web/vitest.config.mts sets
// clearMocks/restoreMocks globally, and calling it again ourselves raced
// the reject path below (the mocked rejection was reported as unhandled
// instead of being caught by `.rejects`) — confirmed by isolating it with
// a throwaway repro; removing the manual reset fixed it, matching every
// other test file in this suite, none of which calls mockReset/mockClear.
describe.each([
    ['getFollowerProfiles', getFollowerProfiles],
    ['getFollowingProfiles', getFollowingProfiles],
] as const)('%s', (_name, fn) => {
    it('maps is_following to a real boolean', async () => {
        execute.mockResolvedValue([
            { id: 'u1', username: 'ada', avatar_url: null, is_following: true },
            { id: 'u2', username: 'bea', avatar_url: 'https://x/y.png', is_following: false },
        ])
        const rows = await fn('target-id', 'viewer-id')
        expect(rows).toEqual([
            { id: 'u1', username: 'ada', avatar_url: null, is_following: true },
            { id: 'u2', username: 'bea', avatar_url: 'https://x/y.png', is_following: false },
        ])
    })

    it('rejects on a database error', async () => {
        execute.mockRejectedValue(new Error('down'))
        await expect(fn('target-id', 'viewer-id')).rejects.toThrow('down')
    })
})

// Final-review finding: the cap and ordering had no test, resting entirely on
// a code read. `db.execute` is mocked, but the drizzle `SQL` object passed to
// it is real — its `queryChunks` carry the literal template text plus any
// interpolated non-chunk values (like the 500 limit) verbatim, so the actual
// generated query is inspectable without a live database.
function flattenSql(call: unknown): string {
    const chunks = (call as { queryChunks?: unknown[] }).queryChunks ?? []
    return chunks
        .map(chunk => (chunk && typeof chunk === 'object' && 'value' in chunk) ? (chunk as { value: string[] }).value.join('') : '')
        .join('')
}

describe('getFollowerProfiles SQL shape', () => {
    it('orders by username then id, caps at 500, and joins on the follower side', async () => {
        execute.mockResolvedValue([])
        await getFollowerProfiles('target-id', 'viewer-id')
        const [sqlArg] = execute.mock.calls.at(-1) ?? []
        const text = flattenSql(sqlArg)
        expect(text).toContain('order by u.username, u.id')
        expect(text).toContain('limit')
        expect(text).toContain('join users u on u.id = f.follower_id')
        expect(text).toContain('where f.following_id =')
        expect((sqlArg as { queryChunks: unknown[] }).queryChunks).toContain(500)
    })
})

describe('getFollowingProfiles SQL shape', () => {
    it('orders by username then id, caps at 500, and joins on the following side', async () => {
        execute.mockResolvedValue([])
        await getFollowingProfiles('target-id', 'viewer-id')
        const [sqlArg] = execute.mock.calls.at(-1) ?? []
        const text = flattenSql(sqlArg)
        expect(text).toContain('order by u.username, u.id')
        expect(text).toContain('limit')
        expect(text).toContain('join users u on u.id = f.following_id')
        expect(text).toContain('where f.follower_id =')
        expect((sqlArg as { queryChunks: unknown[] }).queryChunks).toContain(500)
    })
})
