'use server'

import { requireUser } from '@/lib/auth'
import { createLibraryEntry, updateLibraryEntry, deleteLibraryEntry, getLibraryEntry, upsertLibraryEntries } from '@/lib/queries/library'
import type { SteamLinkEntry } from '@screenpeak/shared/types'

type LibraryEntryFields = {
    status: string
    is100: boolean
    hours: number | null
    playedCount: number
}

export async function fetchLibraryEntry(gameId: number) {
    const user = await requireUser().catch(() => null)
    if (!user) return null
    return getLibraryEntry(user.id, gameId)
}

export async function addOrUpdateLibraryEntry(gameId: number, fields: LibraryEntryFields) {
    const user = await requireUser()
    const existing = await getLibraryEntry(user.id, gameId)
    return existing
        ? updateLibraryEntry(user.id, gameId, fields)
        : createLibraryEntry(user.id, gameId, fields)
}

export async function removeLibraryEntry(entryId: string) {
    const user = await requireUser()
    await deleteLibraryEntry(entryId, user.id)
}

export async function importSteamLibraryEntries(entries: SteamLinkEntry[]) {
    const user = await requireUser()
    return upsertLibraryEntries(user.id, entries)
}
