import { timingSafeEqual } from 'node:crypto'
import { RelyingParty } from 'openid'

const STEAM_PROVIDER = 'https://steamcommunity.com/openid'
const STEAM_ID_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/

export class SteamOpenIdConfigError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'SteamOpenIdConfigError'
    }
}

/** Realm and return_to origin. Never the request Host. */
export function steamRealmOrigin(): string {
    const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? ''
    if (!raw) throw new SteamOpenIdConfigError('NEXT_PUBLIC_SITE_URL is not set')
    let url: URL
    try {
        url = new URL(raw)
    } catch {
        throw new SteamOpenIdConfigError('NEXT_PUBLIC_SITE_URL is not a URL')
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new SteamOpenIdConfigError('NEXT_PUBLIC_SITE_URL is not an http(s) origin')
    }
    return url.origin
}

function callbackReturnUrl(origin: string, state?: string | null): string {
    const base = `${origin}/api/steam/callback`
    if (state == null) return base
    return `${base}?state=${encodeURIComponent(state)}`
}

function createRelyingParty(origin: string, state?: string | null) {
    return new RelyingParty(
        callbackReturnUrl(origin, state),
        origin,
        true,
        false,
        [],
    )
}

export function getSteamAuthUrl(state?: string | null): Promise<string> {
    const rp = createRelyingParty(steamRealmOrigin(), state)

    return new Promise((resolve, reject) => {
        rp.authenticate(STEAM_PROVIDER, false, (error, authUrl) => {
            if (error || !authUrl) {
                reject(error ?? new Error('Steam did not return an auth URL'))
                return
            }
            resolve(authUrl)
        })
    })
}

/** `state` query on the signed openid.return_to. Null when that parameter is absent. */
export function signedReturnState(callbackUrl: string): string | null {
    let callback: URL
    try {
        callback = new URL(callbackUrl)
    } catch {
        return null
    }
    const returnTo = callback.searchParams.get('openid.return_to')
    if (!returnTo) return null
    let parsed: URL
    try {
        parsed = new URL(returnTo)
    } catch {
        return null
    }
    if (!parsed.searchParams.has('state')) return null
    return parsed.searchParams.get('state')
}

/** Both absent (website cookie flow) or both the same bytes. Different lengths are not equal. */
export function sameOpenIdState(expected: string | null, actual: string | null): boolean {
    if (expected == null || actual == null) return expected == null && actual == null
    const left = Buffer.from(expected)
    const right = Buffer.from(actual)
    if (left.length !== right.length) return false
    return timingSafeEqual(left, right)
}

function verifyWithParty(origin: string, callbackUrl: string, state?: string | null): Promise<string> {
    const rp = createRelyingParty(origin, state)
    return new Promise((resolve, reject) => {
        rp.verifyAssertion(callbackUrl, (error, result) => {
            if (error || !result?.authenticated) {
                reject(error ?? new Error('Steam could not verify this sign-in'))
                return
            }
            const match = result.claimedIdentifier?.match(STEAM_ID_RE)
            if (!match?.[1]) {
                reject(new Error('Could not extract SteamID from Steam response'))
                return
            }
            resolve(match[1])
        })
    })
}

/**
 * Verifies a Steam OpenID callback. openid@2.0.17 only requires query params
 * that are already on the signed return_to, so a bare website assertion plus
 * an appended `state` still authenticates. This checks the signed return_to
 * state itself, after the real RelyingParty runs and before the caller stores
 * anything.
 */
export async function verifySteamCallback(callbackUrl: string, state?: string | null): Promise<string> {
    const origin = steamRealmOrigin()
    let steamId: string | undefined
    let libraryError: unknown
    try {
        steamId = await verifyWithParty(origin, callbackUrl, state)
    } catch (error) {
        libraryError = error
    }
    if (!sameOpenIdState(state ?? null, signedReturnState(callbackUrl))) {
        throw new Error('OpenID return_to state does not match')
    }
    if (libraryError) throw libraryError
    if (!steamId) throw new Error('Steam could not verify this sign-in')
    return steamId
}
