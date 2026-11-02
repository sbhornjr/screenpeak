import type { NextRequest } from 'next/server'
import type { MeData } from '@screenpeak/shared/api/me'
import { patchMeSchema } from '@screenpeak/shared/schemas'
import { ApiError, withAuth } from '@/lib/api'
import { deleteAccount } from '@/lib/account-deletion'
import { getBearerUser, requireBearerUser } from '@/lib/auth'
import { consumeWriteRateLimit } from '@/lib/rate-limit'
import { loadMe } from '@/lib/loaders/me'
import { patchAccount } from '@/lib/queries/user'
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
    await consumeWriteRateLimit(user.id)
    const body = parseBody(patchMeSchema, await readJson(req))
    assertWriteOk((await patchAccount(user.id, body)).error)
    return jsonPrivate({ ok: true as const })
})

// Deletes the bearer caller's account. public.users and everything under it
// go with auth.users (ON DELETE CASCADE). The phone signs out after a 200.
export const DELETE = withAuth(async () => {
    const user = await requireBearerUser()
    await consumeWriteRateLimit(user.id)
    const { error } = await deleteAccount(user.id)
    if (error) throw new ApiError(500, 'internal', 'Could not delete the account. Try again.')
    return jsonPrivate({ ok: true as const })
})
