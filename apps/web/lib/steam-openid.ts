import { RelyingParty } from 'openid'

const STEAM_PROVIDER = 'https://steamcommunity.com/openid'
const STEAM_ID_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/

function callbackReturnUrl(origin: string, state?: string | null): string {
    const base = `${origin}/api/steam/callback`
    if (!state) return base
    return `${base}?state=${encodeURIComponent(state)}`
}

function createRelyingParty(origin: string, state?: string | null) {
    return new RelyingParty(
        callbackReturnUrl(origin, state), // return_to — Steam signs this, including the mobile state
        origin,                            // realm
        true,                              // stateless verification — Steam's association mode is unreliable
        false,                             // strict mode
        []                                  // no extensions
    )
}

export function getSteamAuthUrl(origin: string, state?: string): Promise<string> {
    const rp = createRelyingParty(origin, state)

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

// Verifies a Steam OpenID callback and returns the authenticated SteamID64.
// `callbackUrl` must be the full URL Steam redirected back to, including
// the openid.* query params it appended.
export function verifySteamCallback(origin: string, callbackUrl: string, state?: string | null): Promise<string> {
    const rp = createRelyingParty(origin, state)

    return new Promise((resolve, reject) => {
        rp.verifyAssertion(callbackUrl, (error, result) => {
            if (error || !result?.authenticated) {
                reject(error ?? new Error('Steam could not verify this sign-in'))
                return
            }

            const match = result.claimedIdentifier?.match(STEAM_ID_RE)
            if (!match) {
                reject(new Error('Could not extract SteamID from Steam response'))
                return
            }

            resolve(match[1])
        })
    })
}
