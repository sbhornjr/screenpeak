import { describe, it, expect } from 'vitest'
import {
    emailSchema,
    passwordSchema,
    usernameSchema,
    ratingReviewSchema,
    listFieldsSchema,
    bioSchema,
    selectedTitleSchema,
    favoriteGameIdsSchema,
    privacyTypeSchema,
    libraryEntryWriteSchema,
    steamLibraryImportSchema,
    parseOrError,
} from '@screenpeak/shared/schemas'

describe('emailSchema', () => {
    it('accepts a normal address and trims surrounding whitespace', () => {
        const result = emailSchema.safeParse('  ada@example.com  ')
        expect(result.success).toBe(true)
        if (result.success) expect(result.data).toBe('ada@example.com')
    })

    it('rejects an empty string', () => {
        expect(emailSchema.safeParse('').success).toBe(false)
    })

    it('rejects a value with no @ / domain', () => {
        expect(emailSchema.safeParse('not-an-email').success).toBe(false)
    })
})

describe('passwordSchema', () => {
    it('accepts exactly 8 characters', () => {
        expect(passwordSchema.safeParse('12345678').success).toBe(true)
    })

    it('rejects 7 characters', () => {
        const result = passwordSchema.safeParse('1234567')
        expect(result.success).toBe(false)
        if (!result.success) expect(result.error.issues[0].message).toMatch(/at least 8/)
    })
})

describe('usernameSchema', () => {
    it('accepts letters, digits and underscores within 3–20 chars', () => {
        expect(usernameSchema.safeParse('ada_Lovelace_99').success).toBe(true)
    })

    it('rejects fewer than 3 characters', () => {
        expect(usernameSchema.safeParse('ab').success).toBe(false)
    })

    it('rejects more than 20 characters', () => {
        expect(usernameSchema.safeParse('a'.repeat(21)).success).toBe(false)
    })

    it('rejects spaces and punctuation', () => {
        expect(usernameSchema.safeParse('ada lovelace').success).toBe(false)
        expect(usernameSchema.safeParse('ada.lovelace').success).toBe(false)
        expect(usernameSchema.safeParse('ada-lovelace').success).toBe(false)
    })
})

describe('ratingReviewSchema', () => {
    it('coerces a numeric string rating to a number', () => {
        const result = ratingReviewSchema.safeParse({ rating: '7', review: '' })
        expect(result.success).toBe(true)
        if (result.success) expect(result.data.rating).toBe(7)
    })

    it('treats an empty review string as valid (rated, no written review)', () => {
        expect(ratingReviewSchema.safeParse({ rating: 5, review: '' }).success).toBe(true)
    })

    it('rejects a rating below 1 or above 10', () => {
        expect(ratingReviewSchema.safeParse({ rating: 0, review: '' }).success).toBe(false)
        expect(ratingReviewSchema.safeParse({ rating: 11, review: '' }).success).toBe(false)
    })

    it('rejects a non-integer rating', () => {
        expect(ratingReviewSchema.safeParse({ rating: 7.5, review: '' }).success).toBe(false)
    })

    it('rejects a review over 5000 characters', () => {
        expect(ratingReviewSchema.safeParse({ rating: 8, review: 'x'.repeat(5001) }).success).toBe(false)
    })

    it('accepts a review of exactly 5000 characters', () => {
        expect(ratingReviewSchema.safeParse({ rating: 8, review: 'x'.repeat(5000) }).success).toBe(true)
    })
})

describe('listFieldsSchema', () => {
    const base = { name: 'Backlog', description: '', isPublic: true, isPinned: false }

    it('accepts a well-formed list', () => {
        expect(listFieldsSchema.safeParse(base).success).toBe(true)
    })

    it('requires a non-empty name (after trim)', () => {
        expect(listFieldsSchema.safeParse({ ...base, name: '   ' }).success).toBe(false)
    })

    it('rejects a name over 80 characters', () => {
        expect(listFieldsSchema.safeParse({ ...base, name: 'n'.repeat(81) }).success).toBe(false)
    })

    it('rejects a description over 500 characters', () => {
        expect(listFieldsSchema.safeParse({ ...base, description: 'd'.repeat(501) }).success).toBe(false)
    })

    it('rejects non-boolean flags', () => {
        expect(listFieldsSchema.safeParse({ ...base, isPublic: 'yes' }).success).toBe(false)
    })
})

describe('bioSchema', () => {
    it('accepts an empty bio and one of exactly 500 characters', () => {
        expect(bioSchema.safeParse('').success).toBe(true)
        expect(bioSchema.safeParse('b'.repeat(500)).success).toBe(true)
    })

    it('rejects a bio over 500 characters', () => {
        expect(bioSchema.safeParse('b'.repeat(501)).success).toBe(false)
    })
})

describe('selectedTitleSchema', () => {
    it('accepts a fixed genre title and a dynamic "#1 <game> Fan" title', () => {
        expect(selectedTitleSchema.safeParse('Soulslike Sicko').success).toBe(true)
        expect(selectedTitleSchema.safeParse('#1 The Legend of Zelda: Breath of the Wild Fan').success).toBe(true)
    })

    it('rejects an empty title and one over 100 characters', () => {
        expect(selectedTitleSchema.safeParse('   ').success).toBe(false)
        expect(selectedTitleSchema.safeParse('t'.repeat(101)).success).toBe(false)
    })
})

describe('favoriteGameIdsSchema', () => {
    it('accepts up to 5 non-empty id strings', () => {
        expect(favoriteGameIdsSchema.safeParse([]).success).toBe(true)
        expect(favoriteGameIdsSchema.safeParse(['a', 'b', 'c', 'd', 'e']).success).toBe(true)
    })

    it('rejects a 6th game', () => {
        const result = favoriteGameIdsSchema.safeParse(['a', 'b', 'c', 'd', 'e', 'f'])
        expect(result.success).toBe(false)
        if (!result.success) expect(result.error.issues[0].message).toMatch(/5 favorite games/)
    })

    it('rejects an empty-string id', () => {
        expect(favoriteGameIdsSchema.safeParse(['a', '']).success).toBe(false)
    })
})

describe('privacyTypeSchema', () => {
    it('accepts the three known section names', () => {
        expect(privacyTypeSchema.safeParse('Default List').success).toBe(true)
        expect(privacyTypeSchema.safeParse('Library').success).toBe(true)
        expect(privacyTypeSchema.safeParse('Loadout').success).toBe(true)
    })

    it('rejects anything else', () => {
        expect(privacyTypeSchema.safeParse('Profile').success).toBe(false)
        expect(privacyTypeSchema.safeParse('library').success).toBe(false)
    })
})

describe('parseOrError', () => {
    it('returns { success: true, data } on a valid value', () => {
        const result = parseOrError(usernameSchema, 'valid_name')
        expect(result).toEqual({ success: true, data: 'valid_name', error: null })
    })

    it('returns { success: false, error } with the first issue message on an invalid value', () => {
        const result = parseOrError(passwordSchema, 'short')
        expect(result.success).toBe(false)
        expect(result.data).toBeNull()
        expect(result.error).toMatch(/at least 8/)
    })
})

describe('libraryEntryWriteSchema', () => {
    it('accepts a status-only body and hours that fit numeric(8,1)', () => {
        expect(libraryEntryWriteSchema.safeParse({ status: 'completed' }).success).toBe(true)
        expect(libraryEntryWriteSchema.safeParse({ status: 'playing', hours_played: 9999999.9, play_count: 32767 }).success).toBe(true)
    })

    it('rejects a play count above smallint and hours that do not fit numeric(8,1)', () => {
        const play = libraryEntryWriteSchema.safeParse({ status: 'playing', play_count: 32768 })
        const hours = libraryEntryWriteSchema.safeParse({ status: 'playing', hours_played: 12.55 })
        const huge = libraryEntryWriteSchema.safeParse({ status: 'playing', hours_played: 10000000 })
        expect(play.success).toBe(false)
        expect(hours.success).toBe(false)
        expect(huge.success).toBe(false)
    })
})

describe('steamLibraryImportSchema', () => {
    const row = {
        gameId: '11111111-1111-4111-8111-111111111111',
        playtimeSelected: 3,
        status: 'playing',
        selected: true,
        coverImageUrl: null,
        gameName: 'Hades',
        gameDeveloper: 'Supergiant',
        gameReleased: null,
        completedAllAchievements: false,
    }

    it('rejects negative hours and does not cap the selection at 500 rows', () => {
        expect(steamLibraryImportSchema.safeParse([{ ...row, playtimeSelected: -1 }]).success).toBe(false)
        expect(steamLibraryImportSchema.safeParse(Array.from({ length: 501 }, () => row)).success).toBe(true)
    })
})
