import { afterEach, describe, expect, it, vi } from 'vitest'

// user-actions.ts imports this module. Next evaluates that import when any
// server action on the same page runs, including catalogue search from the
// favorite-game picker. Missing avatar credentials must fail the upload
// call, not the import.

const R2_ENV = [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'R2_PUBLIC_URL',
] as const

describe('r2 credentials', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('imports with no R2 env and throws when an upload URL is requested', async () => {
        for (const name of R2_ENV) vi.stubEnv(name, '')
        const { createPresignedAvatarUploadUrl } = await import('@/lib/r2')
        await expect(createPresignedAvatarUploadUrl(
            '00000000-0000-4000-8000-000000000001',
            'image/png',
            1000,
        )).rejects.toThrow('R2_ACCOUNT_ID is not set')
    })
})
