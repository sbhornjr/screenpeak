import { describe, expect, it } from 'vitest'
import { SOCIAL_PANEL } from '@/lib/catalog/images'
import { OG_CARD, shareColumn, wrapShareTitle } from '@/lib/og-layout'

describe('share card title', () => {
    it('wraps a long title inside the column beside the 16:9 panel', () => {
        const column = shareColumn(true)
        expect(column.outer + SOCIAL_PANEL.width).toBe(OG_CARD.width)
        expect(column.width).toBeGreaterThan(400)
        const name = 'The Legend of Heroes: Trails through Daybreak II — The Long Way Around the Continent'
        const title = wrapShareTitle(name, column.width, { maxHeight: 250, maxFont: 52 })
        expect(title.lines.length).toBeGreaterThan(1)
        expect(title.lines.join(' ').replace('…', '')).toContain('Legend')
        const maxChars = Math.floor(column.width / (title.fontSize * 0.62))
        for (const line of title.lines) expect(line.length).toBeLessThanOrEqual(maxChars + 1)
        expect(title.lines.length * title.fontSize * 1.15).toBeLessThanOrEqual(250)
    })

    it('keeps a short title on one line', () => {
        const title = wrapShareTitle('Hades', shareColumn(false).width, { maxFont: 64, maxHeight: 250 })
        expect(title.lines).toEqual(['Hades'])
        expect(title.fontSize).toBe(64)
    })
})
