import { beforeEach, describe, expect, it, vi } from 'vitest'

const where = vi.hoisted(() => vi.fn(async () => undefined))
const set = vi.hoisted(() => vi.fn(() => ({ where })))
const update = vi.hoisted(() => vi.fn(() => ({ set })))

vi.mock('@/lib/db', () => ({ db: { update } }))

import { updateAvatarUrl } from '@/lib/queries/user'

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const BASE = 'https://cdn.example'

describe('updateAvatarUrl', () => {
    beforeEach(() => {
        process.env.R2_PUBLIC_URL = BASE
        update.mockClear()
        set.mockClear()
        where.mockClear()
    })

    it('rejects a URL on another host', async () => {
        const error = await updateAvatarUrl(USER, `https://evil.example/${USER}/avatar`)

        expect(error).toBe('That image URL is not your avatar.')
        expect(update).not.toHaveBeenCalled()
    })

    it('rejects this deployment\'s host when the path is another user\'s object', async () => {
        const error = await updateAvatarUrl(USER, `${BASE}/${OTHER}/avatar`)

        expect(error).toBe('That image URL is not your avatar.')
        expect(update).not.toHaveBeenCalled()
    })

    it('stores the presigned public URL for this user', async () => {
        const url = `${BASE}/${USER}/avatar?v=1710000000000`
        const error = await updateAvatarUrl(USER, url)

        expect(error).toBeNull()
        expect(update).toHaveBeenCalledOnce()
        expect(set).toHaveBeenCalledWith({ avatarUrl: url })
    })
})
