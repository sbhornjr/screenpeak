import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UnauthenticatedError } from '@/lib/api'

const { requireUser, runSteamImportBatch, importConfirmedSteamLibrary, SteamImportInputError } = vi.hoisted(() => {
    class SteamImportInputError extends Error {
        constructor(message: string) {
            super(message)
            this.name = 'SteamImportInputError'
        }
    }
    return {
        requireUser: vi.fn(),
        runSteamImportBatch: vi.fn(),
        importConfirmedSteamLibrary: vi.fn(),
        SteamImportInputError,
    }
})

vi.mock('@/lib/auth', () => ({ requireUser }))
vi.mock('@/lib/queries/steam', () => ({ unlinkSteamAccount: vi.fn() }))
vi.mock('@/lib/catalog/steam-import', () => ({
    parseSteamImportRequest: (input: unknown) => {
        if (input == null) return { retry: false }
        if (typeof input !== 'object' || Array.isArray(input)) throw new SteamImportInputError('Invalid import request.')
        const retry = (input as { retry?: unknown }).retry
        if (retry !== undefined && typeof retry !== 'boolean') throw new SteamImportInputError('Invalid import request.')
        return { retry: retry === true }
    },
    runSteamImportBatch,
    importConfirmedSteamLibrary,
    SteamImportInputError,
}))

import { resolveSteamImportBatch } from '@/app/steam-actions'
import { importSteamLibraryEntries } from '@/app/library-actions'

const batch = {
    entries: [], remaining: 0, totalApps: 0, matchedGameCount: 0, unmatchedAppCount: 0, ambiguousAppCount: 0, retryableAppCount: 0,
}

describe('steam import actions', () => {
    beforeEach(() => {
        requireUser.mockReset()
        runSteamImportBatch.mockReset()
        importConfirmedSteamLibrary.mockReset()
    })

    it('rejects a signed-out caller before reading anyone else\'s library', async () => {
        requireUser.mockRejectedValue(new UnauthenticatedError())
        await expect(resolveSteamImportBatch({ userId: 'other-user', appids: [1] })).rejects.toBeInstanceOf(UnauthenticatedError)
        await expect(importSteamLibraryEntries([])).rejects.toBeInstanceOf(UnauthenticatedError)
        expect(runSteamImportBatch).not.toHaveBeenCalled()
        expect(importConfirmedSteamLibrary).not.toHaveBeenCalled()
    })

    it('uses the signed-in user and ignores a posted user id or app list', async () => {
        requireUser.mockResolvedValue({ id: 'user-a', email: null })
        runSteamImportBatch.mockResolvedValue(batch)
        await resolveSteamImportBatch({ userId: 'user-b', appids: [99], retry: true })
        expect(runSteamImportBatch).toHaveBeenCalledWith('user-a', true)
        importConfirmedSteamLibrary.mockResolvedValue(undefined)
        await importSteamLibraryEntries([])
        expect(importConfirmedSteamLibrary).toHaveBeenCalledWith('user-a', [])
    })

    it('returns a visible error for an invalid request or a rejected library row', async () => {
        requireUser.mockResolvedValue({ id: 'user-a', email: null })
        await expect(resolveSteamImportBatch({ retry: 'yes' })).resolves.toEqual({ error: 'Invalid import request.' })
        expect(runSteamImportBatch).not.toHaveBeenCalled()
        importConfirmedSteamLibrary.mockRejectedValue(new SteamImportInputError('Choose games from your Steam library and try again.'))
        await expect(importSteamLibraryEntries([])).resolves.toEqual({ error: 'Choose games from your Steam library and try again.' })
    })
})
