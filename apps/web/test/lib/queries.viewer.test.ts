import { describe, expect, it, vi } from 'vitest'

const mockDb = {
    select: vi.fn(),
    execute: vi.fn(),
}
vi.mock('@/lib/db', () => ({ db: mockDb }))

const { getLibraryEntry } = await import('@/lib/queries/library')
const { getUserLists } = await import('@/lib/queries/list')

describe('game page viewer reads', () => {
    it('returns null when the viewer has no library row', async () => {
        mockDb.select.mockImplementation(() => ({
            from: () => ({ where: () => ({ limit: async () => [] }) }),
        }))
        await expect(getLibraryEntry('user-1', 'game-1')).resolves.toBeNull()
    })

    it('does not report a library outage as an empty save', async () => {
        mockDb.select.mockImplementation(() => ({
            from: () => ({ where: () => ({ limit: () => Promise.reject(new Error('database unavailable')) }) }),
        }))
        await expect(getLibraryEntry('user-1', 'game-1')).rejects.toThrow('database unavailable')
    })

    it('returns an empty list when the viewer has no lists', async () => {
        mockDb.execute.mockResolvedValueOnce([])
        await expect(getUserLists('user-1', true)).resolves.toEqual([])
    })

    it('does not report a lists outage as no lists', async () => {
        mockDb.execute.mockRejectedValueOnce(new Error('database unavailable'))
        await expect(getUserLists('user-1', true)).rejects.toThrow('database unavailable')
    })
})
