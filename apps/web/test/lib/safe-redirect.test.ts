import { describe, it, expect } from 'vitest'
import { safeNextPath } from '@/lib/safe-redirect'

const origin = 'https://screenpeak.test'

describe('safeNextPath', () => {
    it('passes through the password-reset target AuthModal sends', () => {
        expect(safeNextPath('/auth/update-password', origin)).toBe('/auth/update-password')
    })

    it('keeps query string and hash on a same-origin path', () => {
        expect(safeNextPath('/games?genre=rpg#top', origin)).toBe('/games?genre=rpg#top')
    })

    it('falls back to "/" when next is missing or empty', () => {
        expect(safeNextPath(null, origin)).toBe('/')
        expect(safeNextPath(undefined, origin)).toBe('/')
        expect(safeNextPath('', origin)).toBe('/')
    })

    it.each([
        ['@evil.com', 'userinfo trick: https://site@evil.com'],
        ['.evil.com', 'subdomain trick: https://site.evil.com'],
        ['evil.com', 'no leading slash'],
        ['https://evil.com', 'absolute URL'],
        ['//evil.com', 'protocol-relative'],
        ['/\\evil.com', 'backslash protocol-relative'],
        ['/\t/evil.com', 'tab stripped by the URL parser → //evil.com'],
        ['javascript:alert(1)', 'script scheme'],
    ])('rejects %j (%s)', (raw) => {
        expect(safeNextPath(raw, origin)).toBe('/')
    })

    it('returns "/" when parsing normalizes a path into a protocol-relative URL', () => {
        expect(safeNextPath('/foo/..//evil.com', origin)).toBe('/')
        expect(safeNextPath('/%2e%2e//evil.com', origin)).toBe('/')
        expect(safeNextPath('/auth%09/..//evil.com', origin)).toBe('/')
    })

    it('keeps every accepted result safe to append to the origin', () => {
        for (const raw of ['/a', '/auth/update-password', '/x?y=//evil.com']) {
            const dest = new URL(`${origin}${safeNextPath(raw, origin)}`)
            expect(dest.origin).toBe(origin)
        }
    })
})
