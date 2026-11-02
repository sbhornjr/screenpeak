import { MOBILE_STEAM_RETURN_URL, type SteamLinkIntent } from '@screenpeak/shared/api/steam'

import { actionFailure } from './failure'

// The phone's half of Steam linking (AGENTS.md, Steam). The server binds a
// short-lived `state` to the bearer user and an S256 challenge; the browser
// sheet comes back to screenpeak://steamlink with a one-time code, and only
// this phone holds the verifier that redeems it.

const LINK_FAILED = "Couldn't link Steam. Try again."
const VERIFIER_BYTES = 32

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** Unpadded base64url, RFC 4648 section 5. */
function base64Url(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    out += ALPHABET[a >> 2]
    out += ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)]
    if (b !== undefined) out += ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)]
    if (c !== undefined) out += ALPHABET[c & 63]
  }
  return out
}

export type PkceTools = {
  randomBytes: (count: number) => Uint8Array
  /** SHA-256 of the UTF-8 string, as padded standard base64. */
  sha256Base64: (value: string) => Promise<string>
}

/** RFC 7636: a 43-character verifier from 32 random bytes, and its S256 challenge. */
export async function pkcePair(tools: PkceTools): Promise<{ verifier: string, challenge: string }> {
  const verifier = base64Url(tools.randomBytes(VERIFIER_BYTES))
  const digest = await tools.sha256Base64(verifier)
  const challenge = digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return { verifier, challenge }
}

/** The browser sheet's last URL. Anything but screenpeak://steamlink with a code is a failure. */
export function steamReturn(url: string): { code: string } | { failed: true } {
  const prefix = `${MOBILE_STEAM_RETURN_URL}?`
  if (!url.startsWith(prefix)) return { failed: true }
  for (const pair of url.slice(prefix.length).split('#')[0].split('&')) {
    const [key, value = ''] = pair.split('=')
    if (key === 'code' && value) return { code: decodeURIComponent(value) }
  }
  return { failed: true }
}

export type SteamLinkSteps = {
  pkce: () => Promise<{ verifier: string, challenge: string }>
  intent: (codeChallenge: string) => Promise<SteamLinkIntent>
  /** Opens the API-relative path in the browser sheet. */
  open: (path: string) => Promise<{ type: string, url?: string }>
  complete: (body: { code: string, verifier: string }) => Promise<unknown>
}

export type SteamLinkOutcome =
  | { kind: 'linked' }
  | { kind: 'canceled' }
  | { kind: 'failed', message: string }

export async function linkSteam(steps: SteamLinkSteps): Promise<SteamLinkOutcome> {
  try {
    const { verifier, challenge } = await steps.pkce()
    const intent = await steps.intent(challenge)
    const result = await steps.open(intent.path)
    if (result.type !== 'success' || !result.url) return { kind: 'canceled' }
    const back = steamReturn(result.url)
    if ('failed' in back) return { kind: 'failed', message: LINK_FAILED }
    await steps.complete({ code: back.code, verifier })
    return { kind: 'linked' }
  } catch (error) {
    return { kind: 'failed', message: actionFailure(error) }
  }
}
