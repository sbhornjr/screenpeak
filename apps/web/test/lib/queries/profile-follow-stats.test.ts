import { describe, expect, it, vi } from 'vitest'

const execute = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db', () => ({ db: { execute } }))

import { getProfileFollowStats } from '@/lib/queries/user'

// Final-review finding: the profile page's counts stayed visible to a viewer
// the profile owner has blocked, even once the followers/following list
// itself started hiding behind that same block — "5 Followers" next to an
// empty list is a new, concrete signal that something is wrong, which is
// exactly the oracle the feature's design explicitly forbids. Zeroing the
// counts too keeps every number on the page consistent with the empty list.
describe('getProfileFollowStats', () => {
    it('zeroes the counts and is_following for a viewer the profile has blocked, either direction', async () => {
        execute.mockResolvedValue([{ follower_count: 5, following_count: 3, is_following: true, blocked: true }])
        const stats = await getProfileFollowStats('target-id', 'viewer-id')
        expect(stats).toEqual({ follower_count: 0, following_count: 0, is_following: false })
    })

    it('returns the real counts when not blocked', async () => {
        execute.mockResolvedValue([{ follower_count: 5, following_count: 3, is_following: true, blocked: false }])
        const stats = await getProfileFollowStats('target-id', 'viewer-id')
        expect(stats).toEqual({ follower_count: 5, following_count: 3, is_following: true })
    })

    it('never treats a signed-out viewer as blocked', async () => {
        execute.mockResolvedValue([{ follower_count: 5, following_count: 3, is_following: false, blocked: false }])
        const stats = await getProfileFollowStats('target-id', null)
        expect(stats).toEqual({ follower_count: 5, following_count: 3, is_following: false })
    })

    it('rejects on a database error', async () => {
        execute.mockRejectedValue(new Error('down'))
        await expect(getProfileFollowStats('target-id', 'viewer-id')).rejects.toThrow('down')
    })
})
