import 'server-only'
import { z } from 'zod'
import { logger } from '../logger'

export class IgdbError extends Error {
    constructor(message: string, readonly retryable = false) { super('IGDB ' + message) }
}
export const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
export function retryDelay(attempt: number, after?: string | null): number {
    const exponential = 500 * 2 ** attempt + Math.floor(Math.random() * 250)
    const seconds = after?.trim() ? Number(after) : NaN
    const specified = Number.isFinite(seconds) ? seconds * 1000 : after ? Date.parse(after) - Date.now() : 0
    const delay = Math.max(exponential, Number.isFinite(specified) ? specified : 0)
    if (delay > 30_000) throw new IgdbError('provider cooldown exceeds 30 seconds; retry later.')
    return delay
}
export async function requestAttempt<T>(endpoint: string, url: string, init: RequestInit, schema: z.ZodType<T>, fetcher: typeof fetch) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    const start = performance.now()
    let status: number | null = null
    try {
        const response = await fetcher(url, { ...init, signal: controller.signal, redirect: 'error', cache: 'no-store' })
        status = response.status
        if (!response.ok) {
            await response.body?.cancel().catch(() => {})
            return { ok: false as const, status, retryAfter: response.headers.get('retry-after') }
        }
        let data: unknown
        try { data = await response.json() }
        catch { throw new IgdbError(controller.signal.aborted ? 'request timed out.' : 'invalid response.', controller.signal.aborted) }
        const parsed = schema.safeParse(data)
        if (!parsed.success) throw new IgdbError('invalid response.')
        return { ok: true as const, status, data: parsed.data }
    } catch (error) {
        // Neither provider bodies nor underlying fetch errors/URLs enter logs or public errors.
        if (error instanceof IgdbError) throw error
        throw new IgdbError('request failed or timed out.', true)
    } finally {
        clearTimeout(timer)
        logger.info('igdb', 'Request completed', { endpoint, status, durationMs: Math.round(performance.now() - start) })
    }
}
