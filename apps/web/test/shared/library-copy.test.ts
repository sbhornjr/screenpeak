import { describe, expect, it } from 'vitest'

import { LIBRARY_SECTION_TITLE, libraryEmptyLine, libraryScoreText, libraryStats } from '@screenpeak/shared/library-copy'

describe('library copy', () => {
    it('names the section and the signed-out empty line in plain English', () => {
        expect(LIBRARY_SECTION_TITLE).toBe('In your library')
        expect(libraryEmptyLine(false)).toBe('Sign in to add this game to your library.')
        expect(libraryEmptyLine(true)).toBe('Not in your library yet.')
        expect(libraryScoreText(8)).toBe('8/10')
    })

    it('lists hours and times played, and the 100% flag only when it is set', () => {
        expect(libraryStats({
            hours_played: 12.5,
            play_count: 4,
            completed_all_achievements: true,
        })).toEqual([
            { key: 'hours', value: '12.5', label: 'Hours played 12.5' },
            { key: 'plays', value: '4', label: 'Times played 4' },
            { key: 'complete', value: '100%', label: '100% achievements completed' },
        ])
        expect(libraryStats({
            hours_played: null,
            play_count: 1,
            completed_all_achievements: false,
        })).toEqual([
            { key: 'hours', value: '—', label: 'Hours played —' },
            { key: 'plays', value: '1', label: 'Times played 1' },
        ])
    })
})
