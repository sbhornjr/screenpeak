import { afterEach, describe, it, expect } from 'vitest'
import { parseDbTimestamp, releaseYear } from '@screenpeak/shared/dates'

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

describe('releaseYear', () => {
    const zone = process.env.TZ
    afterEach(() => { process.env.TZ = zone })

    it('reads a January 1 release as that year west of UTC', () => {
        process.env.TZ = 'America/New_York'
        expect(releaseYear('2024-01-01')).toBe(2024)
    })

    it('reads a December 31 release as that year east of UTC', () => {
        process.env.TZ = 'Asia/Tokyo'
        expect(releaseYear('2023-12-31')).toBe(2023)
    })

    it('is null without a date', () => {
        expect(releaseYear(null)).toBeNull()
        expect(releaseYear(undefined)).toBeNull()
        expect(releaseYear('')).toBeNull()
    })

    it('is null when the text does not start with a year', () => {
        expect(releaseYear('TBA')).toBeNull()
    })
})
