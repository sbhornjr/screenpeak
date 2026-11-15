import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireUser = vi.fn()
const consumeWriteRateLimit = vi.fn()
const blockUser = vi.fn()
const unblockUser = vi.fn()

vi.mock('@/lib/auth', () => ({ requireUser }))
vi.mock('@/lib/rate-limit', () => ({ consumeWriteRateLimit }))
vi.mock('@/lib/queries/user', () => ({
    updateAvatarUrl: vi.fn(),
    updateFavoriteGames: vi.fn(),
    updatePrivacy: vi.fn(),
    updateUsername: vi.fn(),
    updateSelectedTitle: vi.fn(),
    updateBio: vi.fn(),
    updateLoadoutBio: vi.fn(),
    clearLoadoutIdentity: vi.fn(),
    followUser: vi.fn(),
    unfollowUser: vi.fn(),
    blockUser,
    unblockUser,
}))
vi.mock('@/lib/avatar-upload', () => ({ avatarUploadErrorMessage: vi.fn() }))
vi.mock('@/lib/r2', () => ({ createPresignedAvatarUploadUrl: vi.fn() }))

const { toggleBlock } = await import('@/app/user-actions')

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TARGET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

beforeEach(() => {
    requireUser.mockReset().mockResolvedValue({ id: USER, email: 'a@x.test' })
    consumeWriteRateLimit.mockReset().mockResolvedValue(undefined)
    blockUser.mockReset().mockResolvedValue(undefined)
    unblockUser.mockReset().mockResolvedValue(undefined)
})

describe('toggleBlock', () => {
    it('blocks: calls requireUser, then consumeWriteRateLimit, then blockUser, in order', async () => {
        const order: string[] = []
        requireUser.mockImplementation(async () => {
            order.push('requireUser')
            return { id: USER, email: 'a@x.test' }
        })
        consumeWriteRateLimit.mockImplementation(async () => {
            order.push('consumeWriteRateLimit')
        })
        blockUser.mockImplementation(async () => {
            order.push('blockUser')
        })

        await toggleBlock(TARGET, false)

        expect(order).toEqual(['requireUser', 'consumeWriteRateLimit', 'blockUser'])
        expect(consumeWriteRateLimit).toHaveBeenCalledWith(USER)
        expect(blockUser).toHaveBeenCalledWith(USER, TARGET)
        expect(unblockUser).not.toHaveBeenCalled()
    })

    it('unblocks when isBlocked is true, after the same rate-limit check', async () => {
        await toggleBlock(TARGET, true)

        expect(consumeWriteRateLimit).toHaveBeenCalledWith(USER)
        expect(unblockUser).toHaveBeenCalledWith(USER, TARGET)
        expect(blockUser).not.toHaveBeenCalled()
    })

    it('does not call blockUser/unblockUser when the rate limit rejects', async () => {
        consumeWriteRateLimit.mockRejectedValueOnce(new Error('rate limited'))

        await expect(toggleBlock(TARGET, false)).rejects.toThrow('rate limited')

        expect(blockUser).not.toHaveBeenCalled()
        expect(unblockUser).not.toHaveBeenCalled()
    })

    it('does not call the rate limiter or the query when requireUser rejects', async () => {
        requireUser.mockRejectedValueOnce(new Error('unauthenticated'))

        await expect(toggleBlock(TARGET, false)).rejects.toThrow('unauthenticated')

        expect(consumeWriteRateLimit).not.toHaveBeenCalled()
        expect(blockUser).not.toHaveBeenCalled()
        expect(unblockUser).not.toHaveBeenCalled()
    })
})
