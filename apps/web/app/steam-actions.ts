'use server'

import { requireUser } from '@/lib/auth'
import { unlinkSteamAccount } from '@/lib/queries/steam'
import { steamImportClientMessage } from '@/lib/catalog/steam-import-errors'
import { parseSteamImportRequest, runSteamImportBatch, SteamImportInputError } from '@/lib/catalog/steam-import'
import type { SteamImportBatch } from '@screenpeak/shared/types'

export async function unlinkSteamAccountAction() {
    const user = await requireUser()
    await unlinkSteamAccount(user.id)
}

/** Resolves the next owned-app batch for the signed-in user. Client app ids and user ids are ignored. */
export async function resolveSteamImportBatch(input?: unknown): Promise<SteamImportBatch | { error: string }> {
    const user = await requireUser()
    try {
        const request = parseSteamImportRequest(input)
        const outcome = await runSteamImportBatch(user.id, request)
        if ('error' in outcome) return { error: steamImportClientMessage(outcome.error) }
        return outcome.batch
    } catch (error) {
        if (error instanceof SteamImportInputError) return { error: error.message }
        throw error
    }
}
