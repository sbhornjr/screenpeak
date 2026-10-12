import 'server-only'
import { z } from 'zod'
import { logger, redact } from '../logger'

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
/** IGDB error bodies are safe to log after secret-shaped fields are removed. */
export function redactIgdbErrorBody(raw: string): string {
    const text = raw.slice(0, 8_000)
    try { return JSON.stringify(redact(JSON.parse(text))).slice(0, 500) }
    catch {
        return text.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]').slice(0, 500)
    }
}
export async function requestAttempt<T>(endpoint: string, url: string, init: RequestInit, schema: z.ZodType<T>, fetcher: typeof fetch) {
    const controller = new AbortController()
    const start = performance.now()
    let status: number | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
        // Abort alone does not bound the wait when a socket ignores the signal.
        // The outer promise rejects at 10s either way; a later fetch rejection is ignored.
        const response = await new Promise<Response>((resolve, reject) => {
            timer = setTimeout(() => {
                controller.abort()
                reject(new IgdbError('request timed out.', true))
            }, 10_000)
            fetcher(url, { ...init, signal: controller.signal, redirect: 'error', cache: 'no-store' }).then(
                value => { clearTimeout(timer); resolve(value) },
                error => { clearTimeout(timer); reject(error) },
            )
        })
        status = response.status
        if (!response.ok) {
            let raw = ''
            try { raw = await response.text() } catch { raw = '' }
            // The Apicalypse body is the query, not a credential. Headers stay out of the log.
            logger.error('igdb', 'Request rejected', {
                endpoint, status,
                query: typeof init.body === 'string' ? init.body.slice(0, 500) : undefined,
                body: redactIgdbErrorBody(raw),
            })
            return { ok: false as const, status, retryAfter: response.headers.get('retry-after') }
        }
        let data: unknown
        try { data = await response.json() }
        catch { throw new IgdbError(controller.signal.aborted ? 'request timed out.' : 'invalid response.', controller.signal.aborted) }
        const parsed = schema.safeParse(data)
        if (!parsed.success) throw new IgdbError('invalid response.')
        return { ok: true as const, status, data: parsed.data }
    } catch (error) {
        // Provider response bodies and underlying fetch errors/URLs stay out of the thrown message.
        // A rejected status logs its body separately, with secrets removed.
        if (error instanceof IgdbError) throw error
        throw new IgdbError('request failed or timed out.', true)
    } finally {
        clearTimeout(timer)
        logger.info('igdb', 'Request completed', { endpoint, status, durationMs: Math.round(performance.now() - start) })
    }
}
