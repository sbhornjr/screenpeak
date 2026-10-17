'use server'

import { requireUser } from '@/lib/auth'
import { deleteLibraryEntry, getLibraryEntry, upsertLibraryEntry, type LibraryEntryFields } from '@/lib/queries/library'
import { importConfirmedSteamLibrary, SteamImportInputError } from '@/lib/catalog/steam-import'
import type { SteamLinkEntry } from '@screenpeak/shared/types'

export async function fetchLibraryEntry(gameId: string) {
    const user = await requireUser().catch(() => null)
    if (!user) return null
    return getLibraryEntry(user.id, gameId)
}

export async function addOrUpdateLibraryEntry(gameId: string, fields: LibraryEntryFields) {
    const user = await requireUser()
    return upsertLibraryEntry(user.id, gameId, fields)
}

export async function removeLibraryEntry(entryId: string) {
    const user = await requireUser()
    await deleteLibraryEntry(entryId, user.id)
}

export async function importSteamLibraryEntries(entries: SteamLinkEntry[]): Promise<{ error?: string }> {
    const user = await requireUser()
    try {
        await importConfirmedSteamLibrary(user.id, entries)
        return {}
    } catch (error) {
        if (error instanceof SteamImportInputError) return { error: error.message }
        throw error
    }
}
