import type { NextRequest } from 'next/server'
import type { ZodType } from 'zod'
import { ApiError } from '@/lib/api'
import { uuidIdSchema } from '@screenpeak/shared/schemas'

export const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' }

export function jsonPrivate<T>(data: T, status = 200): Response {
    return Response.json(data, { status, headers: PRIVATE_HEADERS })
}

export function noContent(): Response {
    return new Response(null, { status: 204, headers: PRIVATE_HEADERS })
}

export async function readJson(req: NextRequest): Promise<unknown> {
    try {
        return await req.json()
    } catch {
        throw new ApiError(400, 'invalid_request', 'Request body must be JSON.')
    }
}

export function parseBody<T>(schema: ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value)
    if (result.success) return result.data
    const issue = result.error.issues[0]
    const path = issue?.path?.length ? `${issue.path.join('.')}: ` : ''
    throw new ApiError(400, 'invalid_request', `${path}${issue?.message ?? 'Invalid input'}`)
}

export function uuidParam(value: string, name: string): string {
    const result = uuidIdSchema.safeParse(value)
    if (!result.success) throw new ApiError(400, 'invalid_request', `${name} must be a uuid.`)
    return result.data
}

/** Drizzle's `error.message` is "Failed query: …". The Postgres text, including
 *  foreign-key and unique violations, sits on `error.cause`. */
export function writeErrorText(error: unknown): string {
    if (typeof error === 'string') return error
    const parts: string[] = []
    const seen = new Set<unknown>()
    let current: unknown = error
    while (current && typeof current === 'object' && !seen.has(current)) {
        seen.add(current)
        const record = current as { message?: unknown, code?: unknown, cause?: unknown }
        if (typeof record.message === 'string' && record.message) parts.push(record.message)
        if (record.code === '23503') parts.push('foreign key violation')
        if (record.code === '23505') parts.push('duplicate key')
        current = record.cause
    }
    return parts.join('\n')
}

/** Validation runs before the query. Anything left is not-found or a database failure. */
export function assertWriteOk(error: string | null | undefined): void {
    if (!error) return
    if (error === 'List not found') throw new ApiError(404, 'not_found', 'Not found.')
    if (/foreign key/i.test(error)) throw new ApiError(400, 'invalid_request', 'Unknown game.')
    if (/unique|duplicate key/i.test(error)) throw new ApiError(400, 'invalid_request', 'That value is already taken.')
    throw new Error(error)
}
