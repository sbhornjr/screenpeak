import { describe, it, expect, vi } from 'vitest'

// Mock the Anthropic SDK — an external API boundary. vi.hoisted lets the mock
// factory (which is hoisted above imports) reference the shared spy.
const { create } = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({
    default: class {
        messages = { create }
    },
}))

import { generateLoadoutIdentity } from '@/lib/loadout'

const sampleData = {
    username: 'ada',
    totalGames: 100,
    completedGames: 40,
    totalRatings: 60,
    avgRating: 7.8,
    topGenres: [{ genre_name: 'RPG', weighted_rating: 8.2, rated_count: 20, completed_count: 12 }],
    topDevelopers: [{ developer_name: 'Larian', weighted_rating: 9, rated_count: 5, game_count: 8 }],
}

describe('generateLoadoutIdentity', () => {
    it('returns the model text on a successful text response', async () => {
        create.mockResolvedValue({ content: [{ type: 'text', text: 'You crush roguelikes at 2am.' }] })

        await expect(generateLoadoutIdentity(sampleData)).resolves.toBe('You crush roguelikes at 2am.')
    })

    it('degrades to an empty string (and logs) when the API call fails', async () => {
        create.mockRejectedValue(new Error('rate limited'))
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        await expect(generateLoadoutIdentity(sampleData)).resolves.toBe('')
        expect(errSpy).toHaveBeenCalled()
    })

    it('returns an empty string when the first content block is not text', async () => {
        create.mockResolvedValue({ content: [{ type: 'tool_use', id: 'x', name: 'y', input: {} }] })

        await expect(generateLoadoutIdentity(sampleData)).resolves.toBe('')
    })
})
