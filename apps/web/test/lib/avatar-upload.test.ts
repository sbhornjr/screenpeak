import { describe, it, expect } from 'vitest'
import { getAvatarKeyForUpload, buildAvatarPublicUrl, isValidAvatarSize, MAX_AVATAR_BYTES } from '@/lib/avatar-upload'

describe('getAvatarKeyForUpload', () => {
    it('returns the same key for image/png, image/jpeg, and image/webp', () => {
        // No extension in the key: R2 serves the Content-Type set on the object
        // (signed into the presigned PUT), not one inferred from the key. A
        // single key per user means switching content types overwrites in
        // place instead of leaving the old type's object behind forever.
        expect(getAvatarKeyForUpload('user-1', 'image/png')).toBe('user-1/avatar')
        expect(getAvatarKeyForUpload('user-1', 'image/jpeg')).toBe('user-1/avatar')
        expect(getAvatarKeyForUpload('user-1', 'image/webp')).toBe('user-1/avatar')
    })

    it('returns null for a content type outside the allow-list, even one that looks like an image', () => {
        expect(getAvatarKeyForUpload('user-1', 'image/svg+xml')).toBeNull()
        expect(getAvatarKeyForUpload('user-1', 'image/gif')).toBeNull()
        expect(getAvatarKeyForUpload('user-1', 'text/plain')).toBeNull()
    })

    it('derives the key from the given userId, never a fixed or shared value', () => {
        expect(getAvatarKeyForUpload('user-2', 'image/png')).toBe('user-2/avatar')
    })
})

describe('buildAvatarPublicUrl', () => {
    it('joins a base URL and key with a single slash', () => {
        expect(buildAvatarPublicUrl('https://cdn.screenpeak.gg', 'user-1/avatar'))
            .toBe('https://cdn.screenpeak.gg/user-1/avatar')
    })

    it('trims a trailing slash on the base URL to avoid a double slash', () => {
        expect(buildAvatarPublicUrl('https://cdn.screenpeak.gg/', 'user-1/avatar'))
            .toBe('https://cdn.screenpeak.gg/user-1/avatar')
    })

    it('appends a cache-busting version query param when given one', () => {
        expect(buildAvatarPublicUrl('https://cdn.screenpeak.gg', 'user-1/avatar', '1234'))
            .toBe('https://cdn.screenpeak.gg/user-1/avatar?v=1234')
    })

    it('produces a different URL for two different versions of the same key', () => {
        // The object key is stable per user by design (overwrite in place, no
        // orphaned objects) — the version param is what lets a browser or the
        // Next.js image optimizer tell "old upload" and "new upload" apart at
        // the same key, instead of serving a stale cached response forever.
        const first = buildAvatarPublicUrl('https://cdn.screenpeak.gg', 'user-1/avatar', 'aaa')
        const second = buildAvatarPublicUrl('https://cdn.screenpeak.gg', 'user-1/avatar', 'bbb')
        expect(first).not.toBe(second)
    })
})

describe('isValidAvatarSize', () => {
    it('accepts a small, ordinary file size', () => {
        expect(isValidAvatarSize(1024)).toBe(true)
    })

    it('accepts exactly the maximum size', () => {
        expect(isValidAvatarSize(MAX_AVATAR_BYTES)).toBe(true)
    })

    it('rejects one byte over the maximum', () => {
        expect(isValidAvatarSize(MAX_AVATAR_BYTES + 1)).toBe(false)
    })

    it('rejects zero and negative sizes', () => {
        expect(isValidAvatarSize(0)).toBe(false)
        expect(isValidAvatarSize(-1)).toBe(false)
    })
})
