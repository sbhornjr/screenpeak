import { describe, it, expect } from 'vitest'
import { parseDbTimestamp } from '@screenpeak/shared/dates'

describe('parseDbTimestamp', () => {
    it('parses postgres\'s space-separated, 2-digit-offset format', () => {
        const date = parseDbTimestamp('2026-09-23 04:16:14.251443+00')
        expect(date.toISOString()).toBe('2026-09-23T04:16:14.251Z')
    })

    it('parses an already-ISO timestamp unchanged', () => {
        const date = parseDbTimestamp('2026-09-23T04:16:14.251Z')
        expect(date.toISOString()).toBe('2026-09-23T04:16:14.251Z')
    })

    it('does not double-append a colon when the offset already has one', () => {
        const date = parseDbTimestamp('2026-09-23T04:16:14.251+00:00')
        expect(date.toISOString()).toBe('2026-09-23T04:16:14.251Z')
    })

    it('handles a space-separated timestamp with no fractional seconds', () => {
        const date = parseDbTimestamp('2026-09-23 04:16:14+00')
        expect(date.toISOString()).toBe('2026-09-23T04:16:14.000Z')
    })

    it('applies a positive non-UTC offset', () => {
        const date = parseDbTimestamp('2026-09-23 04:16:14+05')
        expect(date.toISOString()).toBe('2026-09-22T23:16:14.000Z')
    })

    it('applies a negative offset', () => {
        const date = parseDbTimestamp('2026-09-23 04:16:14-05')
        expect(date.toISOString()).toBe('2026-09-23T09:16:14.000Z')
    })
})
