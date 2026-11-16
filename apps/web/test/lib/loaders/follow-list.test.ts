import { beforeEach, describe, expect, it, vi } from 'vitest'

const userQ = vi.hoisted(() => ({
    getUserIdFromUsername: vi.fn(),
    isBlockedEitherWay: vi.fn(),
    getFollowerProfiles: vi.fn(),
    getFollowingProfiles: vi.fn(),
}))
vi.mock('@/lib/queries/user', () => userQ)

import { loadFollowList } from '@/lib/loaders/follow-list'

const TARGET = { id: 'target-id' }
const ENTRIES = [{ id: 'u1', username: 'ada', avatar_url: null, is_following: true }]

describe('loadFollowList', () => {
    beforeEach(() => {
        userQ.getUserIdFromUsername.mockReset()
        userQ.isBlockedEitherWay.mockReset()
        userQ.getFollowerProfiles.mockReset()
        userQ.getFollowingProfiles.mockReset()
    })

    it('returns null when the username does not exist', async () => {
        userQ.getUserIdFromUsername.mockResolvedValue(null)
        expect(await loadFollowList('nobody', 'followers', 'viewer-id')).toBeNull()
        expect(userQ.isBlockedEitherWay).not.toHaveBeenCalled()
    })

    it('returns null when the viewer is blocked by the target, either direction', async () => {
        userQ.getUserIdFromUsername.mockResolvedValue(TARGET)
        userQ.isBlockedEitherWay.mockResolvedValue(true)
        expect(await loadFollowList('ada', 'followers', 'viewer-id')).toBeNull()
    })

    it('skips the block check for a signed-out viewer and returns the list', async () => {
        userQ.getUserIdFromUsername.mockResolvedValue(TARGET)
        userQ.getFollowerProfiles.mockResolvedValue(ENTRIES)
        const result = await loadFollowList('ada', 'followers', null)
        expect(result).toBe(ENTRIES)
        expect(userQ.isBlockedEitherWay).not.toHaveBeenCalled()
    })

    it('calls getFollowerProfiles for kind "followers"', async () => {
        userQ.getUserIdFromUsername.mockResolvedValue(TARGET)
        userQ.isBlockedEitherWay.mockResolvedValue(false)
        userQ.getFollowerProfiles.mockResolvedValue(ENTRIES)
        await loadFollowList('ada', 'followers', 'viewer-id')
        expect(userQ.getFollowerProfiles).toHaveBeenCalledWith(TARGET.id, 'viewer-id')
    })

    it('calls getFollowingProfiles for kind "following"', async () => {
        userQ.getUserIdFromUsername.mockResolvedValue(TARGET)
        userQ.isBlockedEitherWay.mockResolvedValue(false)
        userQ.getFollowingProfiles.mockResolvedValue(ENTRIES)
        await loadFollowList('ada', 'following', 'viewer-id')
        expect(userQ.getFollowingProfiles).toHaveBeenCalledWith(TARGET.id, 'viewer-id')
    })
})
