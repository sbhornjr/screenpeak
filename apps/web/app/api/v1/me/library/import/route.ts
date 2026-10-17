import type { NextRequest } from 'next/server'
import { steamLibraryImportSchema } from '@screenpeak/shared/schemas'
import { ApiError, withAuth } from '@/lib/api'
import { requireBearerUser } from '@/lib/auth'
import { importConfirmedSteamLibrary, SteamImportInputError } from '@/lib/catalog/steam-import'
import { jsonPrivate, parseBody, readJson } from '@/lib/write-http'

export const POST = withAuth(async (req: NextRequest) => {
    const user = await requireBearerUser()
    const entries = parseBody(steamLibraryImportSchema, await readJson(req))
    try {
        await importConfirmedSteamLibrary(user.id, entries)
    } catch (error) {
        if (error instanceof SteamImportInputError) throw new ApiError(400, 'invalid_request', error.message)
        throw error
    }
    return jsonPrivate({ ok: true as const })
})
