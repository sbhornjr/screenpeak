import 'server-only'
import { z } from 'zod'
import { getIgdbToken, type TokenManager } from './auth'
import { IgdbError, requestAttempt, retryDelay, wait } from './http'

export type IgdbLease = { dispatchBefore: number; release(): Promise<void> }
export type IgdbBudget = { acquire(clientId: string): Promise<IgdbLease> }
const endpoints = new Set(['games', 'external_games', 'external_game_sources', 'game_types', 'age_rating_organizations', 'age_rating_categories', 'website_types'])
const sharedBudget: IgdbBudget = {
    async acquire(clientId) { return (await import('../queries/igdb-budget')).acquireIgdbLease(clientId) },
}
export function createIgdbClient(options: { clientId: string; fetcher?: typeof fetch; auth?: TokenManager; budget?: IgdbBudget }) {
    const stats = { apiRequests: 0, retries: 0, byEndpoint: {} as Record<string, number> }
    const auth = options.auth ?? { getToken: getIgdbToken }
    return {
        stats,
        // Server-internal transport. Product callers use provider.ts query builders, never client-supplied bodies.
        async request<T>(endpoint: string, body: string, schema: z.ZodType<T>): Promise<T> {
            if (!endpoints.has(endpoint)) throw new IgdbError('endpoint is not allowed.')
            if (!options.clientId.trim()) throw new IgdbError('set TWITCH_CLIENT_ID.')
            let token = await auth.getToken()
            let refreshed = false
            for (let attempt = 0; attempt < 3; attempt++) {
                let lease: IgdbLease
                try { lease = await (options.budget ?? sharedBudget).acquire(options.clientId) }
                catch { throw new IgdbError('shared request budget unavailable.') }
                let result
                try {
                    if (performance.now() >= lease.dispatchBefore) throw new IgdbError('request reservation expired; retry later.')
                    stats.apiRequests++; stats.byEndpoint[endpoint] = (stats.byEndpoint[endpoint] ?? 0) + 1
                    result = await requestAttempt(endpoint, 'https://api.igdb.com/v4/' + endpoint, {
                        method: 'POST', body,
                        headers: { 'Client-ID': options.clientId, Authorization: 'Bearer ' + token, Accept: 'application/json', 'Content-Type': 'text/plain' },
                    }, schema, options.fetcher ?? fetch)
                } catch (error) {
                    if (!(error instanceof IgdbError) || !error.retryable || attempt === 2) throw error
                } finally {
                    try { await lease.release() } catch { throw new IgdbError('shared request budget unavailable.') }
                }
                if (!result) { stats.retries++; await wait(retryDelay(attempt)); continue }
                if (result.ok) return result.data
                if (result.status === 401 && !refreshed && attempt < 2) {
                    refreshed = true; stats.retries++; token = await auth.getToken(token); continue
                }
                if ((result.status === 429 || result.status >= 500) && attempt < 2) {
                    stats.retries++; await wait(retryDelay(attempt, result.retryAfter)); continue
                }
                throw new IgdbError(endpoint + ' HTTP ' + result.status + '.')
            }
            throw new IgdbError('request exhausted retries.')
        },
    }
}
let singleton: ReturnType<typeof createIgdbClient> | undefined
export function igdbRequest<T>(endpoint: string, body: string, schema: z.ZodType<T>) {
    singleton ??= createIgdbClient({ clientId: process.env.TWITCH_CLIENT_ID ?? '' })
    return singleton.request(endpoint, body, schema)
}
