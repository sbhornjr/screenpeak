import { describe, it, expect } from 'vitest'
import { getTitles } from '@screenpeak/shared/titles'

const GENRE_TITLE_COUNT = 18

describe('getTitles', () => {
    it('always includes the fixed genre titles regardless of input', () => {
        const titles = getTitles({ topGames: [], topDevelopers: [] })
        expect(titles).toHaveLength(GENRE_TITLE_COUNT)
        expect(titles).toContain('Platforming Prodigy')
        expect(titles).toContain('Soulslike Sicko')
    })

    it('maps each top game to a "#1 <name> Fan" title', () => {
        const titles = getTitles({ topGames: ['Hades', 'Celeste'], topDevelopers: [] })
        expect(titles).toContain('#1 Hades Fan')
        expect(titles).toContain('#1 Celeste Fan')
        expect(titles).toHaveLength(GENRE_TITLE_COUNT + 2)
    })

    it('maps each top developer to a "#1 <name> Fan" title', () => {
        const titles = getTitles({ topGames: [], topDevelopers: ['Supergiant Games'] })
        expect(titles).toContain('#1 Supergiant Games Fan')
        expect(titles).toHaveLength(GENRE_TITLE_COUNT + 1)
    })

    it('orders results as genre titles, then game titles, then developer titles', () => {
        const titles = getTitles({ topGames: ['GameA'], topDevelopers: ['DevA'] })
        const gameIdx = titles.indexOf('#1 GameA Fan')
        const devIdx = titles.indexOf('#1 DevA Fan')
        expect(gameIdx).toBe(GENRE_TITLE_COUNT)
        expect(devIdx).toBe(GENRE_TITLE_COUNT + 1)
    })
})
