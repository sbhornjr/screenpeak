import { describe, it, expect } from 'vitest'
import { getAvatarKeyForUpload, buildAvatarPublicUrl } from '@/lib/avatar-upload'

describe('getAvatarKeyForUpload', () => {
    it('maps image/png to a .png key', () => {
        expect(getAvatarKeyForUpload('user-1', 'image/png')).toEqual({
            key: 'user-1/avatar.png',
            ext: 'png',
        })
    })

    it('maps image/jpeg to a .jpg key', () => {
        expect(getAvatarKeyForUpload('user-1', 'image/jpeg')).toEqual({
            key: 'user-1/avatar.jpg',
            ext: 'jpg',
        })
    })

    it('maps image/webp to a .webp key', () => {
        expect(getAvatarKeyForUpload('user-1', 'image/webp')).toEqual({
            key: 'user-1/avatar.webp',
            ext: 'webp',
        })
    })

    it('returns null for a content type outside the allow-list, even one that looks like an image', () => {
        expect(getAvatarKeyForUpload('user-1', 'image/svg+xml')).toBeNull()
        expect(getAvatarKeyForUpload('user-1', 'image/gif')).toBeNull()
        expect(getAvatarKeyForUpload('user-1', 'text/plain')).toBeNull()
    })

    it('derives the key from the given userId, never a fixed or shared value', () => {
        expect(getAvatarKeyForUpload('user-2', 'image/png')?.key).toBe('user-2/avatar.png')
    })
})

describe('buildAvatarPublicUrl', () => {
    it('joins a base URL and key with a single slash', () => {
        expect(buildAvatarPublicUrl('https://cdn.screenpeak.gg', 'user-1/avatar.png'))
            .toBe('https://cdn.screenpeak.gg/user-1/avatar.png')
    })

    it('trims a trailing slash on the base URL to avoid a double slash', () => {
        expect(buildAvatarPublicUrl('https://cdn.screenpeak.gg/', 'user-1/avatar.png'))
            .toBe('https://cdn.screenpeak.gg/user-1/avatar.png')
    })

    it('appends a cache-busting version query param when given one', () => {
        expect(buildAvatarPublicUrl('https://cdn.screenpeak.gg', 'user-1/avatar.png', '1234'))
            .toBe('https://cdn.screenpeak.gg/user-1/avatar.png?v=1234')
    })

    it('produces a different URL for two different versions of the same key', () => {
        // The object key is stable per user+content-type by design (overwrite in
        // place, no orphaned objects) — the version param is what lets a browser
        // or the Next.js image optimizer tell "old upload" and "new upload" apart
        // at the same key, instead of serving a stale cached response forever.
        const first = buildAvatarPublicUrl('https://cdn.screenpeak.gg', 'user-1/avatar.png', 'aaa')
        const second = buildAvatarPublicUrl('https://cdn.screenpeak.gg', 'user-1/avatar.png', 'bbb')
        expect(first).not.toBe(second)
    })
})
