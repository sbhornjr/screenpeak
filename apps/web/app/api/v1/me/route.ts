import type { NextRequest } from 'next/server'
import type { MeData } from '@screenpeak/shared/api/me'
import { patchMeSchema } from '@screenpeak/shared/schemas'
import { withAuth } from '@/lib/api'
import { getBearerUser, requireBearerUser } from '@/lib/auth'
import { loadMe } from '@/lib/loaders/me'
import {
    updateBio,
    updateFavoriteGames,
    updateLoadoutBio,
    updatePrivacy,
    updateSelectedTitle,
    updateUsername,
} from '@/lib/queries/user'
import { assertWriteOk, jsonPrivate, parseBody, readJson } from '@/lib/write-http'

const PRIVATE = { headers: { 'Cache-Control': 'private, no-store' } }

// The caller's profile card. Signed out (no bearer token) returns user: null.
export const GET = withAuth(async () => {
    const user = await getBearerUser()
    const data = await loadMe(user?.id ?? null)
    return Response.json(data satisfies MeData, PRIVATE)
})

export const PATCH = withAuth(async (req: NextRequest) => {
    const user = await requireBearerUser()
    const body = parseBody(patchMeSchema, await readJson(req))
    if (body.username !== undefined) assertWriteOk((await updateUsername(user.id, body.username)).error)
    if (body.bio !== undefined) assertWriteOk((await updateBio(user.id, body.bio)).error)
    if (body.selectedTitle !== undefined) assertWriteOk((await updateSelectedTitle(user.id, body.selectedTitle)).error)
    if (body.loadoutBio !== undefined) assertWriteOk((await updateLoadoutBio(user.id, body.loadoutBio)).error)
    if (body.favoriteGames !== undefined) assertWriteOk((await updateFavoriteGames(user.id, body.favoriteGames)).error)
    if (body.privacy !== undefined) assertWriteOk(await updatePrivacy(body.privacy.public, body.privacy.type, user.id))
    return jsonPrivate({ ok: true as const })
})
