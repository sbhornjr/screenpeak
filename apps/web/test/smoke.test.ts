import { describe, it, expect } from 'vitest'
import { getTitles } from '@screenpeak/shared/titles'

// Confirms the toolchain: TS compiles, the `@/*` alias resolves, expect works.
describe('toolchain smoke', () => {
    it('resolves the @/ alias and runs', () => {
        expect(typeof getTitles).toBe('function')
    })
})
