import { describe, expect, it } from 'vitest'
import { tamper } from './tamper'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const STEM = 'A'.repeat(42)
const FLIPPED = 'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY'

describe('tamper', () => {
    it('flips a data bit when the signature ends in a', () => {
        expect(tamper(`${STEM}a`)).toBe(FLIPPED)
        expect(tamper('v1.user.jti.1700000300.siga')).toBe('v1.user.jti.1700000300.syga')
    })

    it('flips the same digest when the final character is only unused bits', () => {
        expect(tamper(`${STEM}Y`)).toBe(FLIPPED)
        expect(tamper(`${STEM}Z`)).toBe(FLIPPED)
        expect(tamper(`${STEM}b`)).toBe(FLIPPED)
    })

    it('changes the decoded signature bytes for every base64url final character', () => {
        for (const last of ALPHABET) {
            const signature = STEM + last
            const before = Buffer.from(signature, 'base64url')
            const after = Buffer.from(tamper(signature), 'base64url')
            expect([...after]).toEqual([...before].map((byte, index) => index === 0 ? byte ^ 1 : byte))
        }
    })

    it('rejects an empty value', () => {
        expect(() => tamper('')).toThrow(/non-empty/)
    })
})
