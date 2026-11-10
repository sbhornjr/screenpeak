import type { NextRequest } from 'next/server'
import type { LibraryWriteResult } from '@screenpeak/shared/api/writes'
import { libraryEntryWriteSchema } from '@screenpeak/shared/schemas'
import { ApiError, withAuth } from '@/lib/api'
import { requireBearerUser } from '@/lib/auth'
import { consumeWriteRateLimit } from '@/lib/rate-limit'
import { deleteLibraryEntryByGame, getLibraryEntry, upsertLibraryEntry } from '@/lib/queries/library'
import { assertWriteOk, jsonPrivate, noContent, parseBody, readJson, uuidParam, writeErrorText } from '@/lib/write-http'

function toEntry(row: {
    id: string
    status: string
    completed_all_achievements: boolean | null
    hours_played: string | null
    play_count: number | null
}): LibraryWriteResult {
    return {
        id: row.id,
        status: row.status,
        completed_all_achievements: row.completed_all_achievements ?? false,
        hours_played: row.hours_played == null ? null : Number(row.hours_played),
        play_count: row.play_count ?? 1,
    }
}

export const GET = withAuth(async (_req: NextRequest, ctx: RouteContext<'/api/v1/me/library/[gameId]'>) => {
    const user = await requireBearerUser()
    const { gameId: raw } = await ctx.params
    const gameId = uuidParam(raw, 'gameId')
    const row = await getLibraryEntry(user.id, gameId)
    if (!row) throw new ApiError(404, 'not_found', 'Not in your save.')
    return jsonPrivate(toEntry(row))
})

export const PUT = withAuth(async (req: NextRequest, ctx: RouteContext<'/api/v1/me/library/[gameId]'>) => {
    const user = await requireBearerUser()
    await consumeWriteRateLimit(user.id)
    const { gameId: raw } = await ctx.params
    const gameId = uuidParam(raw, 'gameId')
    const body = parseBody(libraryEntryWriteSchema, await readJson(req))
    // Only keys present in the JSON are written. A status-only body must not
    // clear hours, play count, or the 100% flag on a row that already exists.
    try {
        const row = await upsertLibraryEntry(user.id, gameId, {
            status: body.status,
            ...(body.completed_all_achievements !== undefined ? { is100: body.completed_all_achievements } : {}),
            ...(body.hours_played !== undefined ? { hours: body.hours_played } : {}),
            ...(body.play_count !== undefined ? { playedCount: body.play_count } : {}),
        })
        if (!row) throw new Error('library write returned no row')
        return jsonPrivate(toEntry(row))
    } catch (error) {
        assertWriteOk(writeErrorText(error), error)
        throw error
    }
})

export const DELETE = withAuth(async (_req: NextRequest, ctx: RouteContext<'/api/v1/me/library/[gameId]'>) => {
    const user = await requireBearerUser()
    await consumeWriteRateLimit(user.id)
    const { gameId: raw } = await ctx.params
    const gameId = uuidParam(raw, 'gameId')
    const removed = await deleteLibraryEntryByGame(user.id, gameId)
    if (!removed) throw new ApiError(404, 'not_found', 'Not in your save.')
    return noContent()
})
