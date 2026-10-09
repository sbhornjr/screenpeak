import 'server-only'
import { z } from 'zod'
import { IgdbError, requestAttempt, retryDelay, wait } from './http'

export type TokenManager = { getToken(rejectedToken?: string): Promise<string> }
export function createTokenManager(options: { clientId: string; clientSecret: string; fetcher?: typeof fetch }): TokenManager {
    let cached: { value: string; expiresAt: number } | undefined
    let pending: Promise<string> | undefined
    async function authenticate() {
        if (!options.clientId.trim() || !options.clientSecret.trim()) throw new IgdbError('set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET.')
        const url = new URL('https://id.twitch.tv/oauth2/token')
        url.search = new URLSearchParams({ client_id: options.clientId, client_secret: options.clientSecret, grant_type: 'client_credentials' }).toString()
        const schema = z.object({ access_token: z.string().min(1), expires_in: z.number().int().positive(), token_type: z.string().refine(v => v.toLowerCase() === 'bearer') })
        for (let attempt = 0; attempt < 3; attempt++) {
            // Counting TTL from request start is conservative when OAuth responds slowly.
            const requestedAt = Date.now()
            let result
            try { result = await requestAttempt('oauth', url.toString(), { method: 'POST' }, schema, options.fetcher ?? fetch) }
            catch (error) {
                if (!(error instanceof IgdbError) || !error.retryable || attempt === 2) throw error
                await wait(retryDelay(attempt)); continue
            }
            if (result.ok) {
                cached = { value: result.data.access_token, expiresAt: requestedAt + Math.max(0, result.data.expires_in - 60) * 1000 }
                return cached.value
            }
            if ((result.status === 429 || result.status >= 500) && attempt < 2) {
                await wait(retryDelay(attempt, result.retryAfter)); continue
            }
            throw new IgdbError('oauth HTTP ' + result.status + '.')
        }
        throw new IgdbError('authentication exhausted retries.')
    }
    return {
        async getToken(rejectedToken?: string) {
            if (rejectedToken && cached?.value === rejectedToken) cached = undefined
            if (cached && cached.expiresAt > Date.now()) return cached.value
            if (!pending) pending = authenticate().finally(() => { pending = undefined })
            return pending
        },
    }
}
let singleton: TokenManager | undefined
export function getIgdbToken(rejectedToken?: string) {
    singleton ??= createTokenManager({ clientId: process.env.TWITCH_CLIENT_ID ?? '', clientSecret: process.env.TWITCH_CLIENT_SECRET ?? '' })
    return singleton.getToken(rejectedToken)
}
