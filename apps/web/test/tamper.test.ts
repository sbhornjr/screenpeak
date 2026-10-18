import { describe, expect, it } from 'vitest'
import { tamper } from './tamper'

describe('tamper', () => {
    it('flips a trailing a to b', () => {
        expect(tamper('v1.user.jti.1700000300.siga')).toBe('v1.user.jti.1700000300.sigb')
    })

    it('flips any other last character to a', () => {
        expect(tamper('v1.user.jti.1700000300.sigZ')).toBe('v1.user.jti.1700000300.siga')
    })

    it('rejects an empty value', () => {
        expect(() => tamper('')).toThrow(/non-empty/)
    })
})
