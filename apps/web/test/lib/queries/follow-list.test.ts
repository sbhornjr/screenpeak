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
