import { describe, it, expect } from 'vitest'
import { plus1 } from '@/lib/plus1'

// Runs in the default node environment where `window` is undefined — this is
// the server-render path. plus1 must no-op instead of throwing.
describe('plus1 (server)', () => {
    it('is a silent no-op when window is undefined', () => {
        expect(typeof window).toBe('undefined')
        expect(() => plus1('SAVED', 2)).not.toThrow()
    })
})
