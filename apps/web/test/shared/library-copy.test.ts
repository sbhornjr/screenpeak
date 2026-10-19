import { describe, expect, it } from 'vitest'

import { LIBRARY_SECTION_TITLE, libraryEmptyLine, libraryStatLines } from '@screenpeak/shared/library-copy'

describe('library copy', () => {
    it('names the section and the signed-out empty line in plain English', () => {
        expect(LIBRARY_SECTION_TITLE).toBe('In your library')
        expect(libraryEmptyLine(false)).toBe('Sign in to add this game to your library.')
        expect(libraryEmptyLine(true)).toBe('Not in your library yet.')
    })

    it('lists hours, times played, and the 100% flag for a library row', () => {
        expect(libraryStatLines({
            hours_played: 12.5,
            play_count: 4,
            completed_all_achievements: true,
        })).toEqual([
            'Hours played 12.5',
            'Times played 4',
            '100% achievements completed',
        ])
        expect(libraryStatLines({
            hours_played: null,
            play_count: 1,
            completed_all_achievements: false,
        })).toEqual([
            'Hours played —',
            'Times played 1',
            '100% achievements not completed',
        ])
    })
})
