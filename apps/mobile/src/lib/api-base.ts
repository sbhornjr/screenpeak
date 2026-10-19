// Dev talks to `npm run dev` on the same machine Metro is using. Expo's hostUri
// is that machine (`192.168.1.20:8081`); the API is Next's port, 3000.
// EXPO_PUBLIC_API_URL overrides it (the verify harness, a non-default port, a tunnel).
// A derived host is only a LAN address. A release build does not guess one, and
// its configured origin has to be https.

const DEV_API_PORT = 3000

const RELEASE_API_BASE_MESSAGE =
  'This release build has no API base URL. Set EXPO_PUBLIC_API_URL to the ScreenPeak site URL before shipping.'

const RELEASE_HTTPS_MESSAGE = 'This release build\'s API URL must use https:.'

export const MISSING_DEV_HOST_MESSAGE =
  'No dev API host: Expo hostUri is missing. Set EXPO_PUBLIC_API_URL to the computer running npm run dev.'

export class MissingDevHostError extends Error {
  constructor() {
    super(MISSING_DEV_HOST_MESSAGE)
    this.name = 'MissingDevHostError'
  }
}

export function hostFromExpoHostUri(hostUri: string): string | null {
  const trimmed = hostUri.trim()
  if (!trimmed) return null
  const withoutScheme = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  const authority = withoutScheme.split('/')[0]?.split('?')[0] ?? ''
  if (!authority) return null
  const at = authority.lastIndexOf('@')
  const hostport = at === -1 ? authority : authority.slice(at + 1)
  if (!hostport) return null
  if (hostport.startsWith('[')) {
    const end = hostport.indexOf(']')
    if (end < 0) return null
    return hostport.slice(1, end) || null
  }
  if (hostport.indexOf(':') !== hostport.lastIndexOf(':')) return null
  const colon = hostport.indexOf(':')
  const host = colon === -1 ? hostport : hostport.slice(0, colon)
  return host || null
}

function isPrivateIpv4(host: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!match) return false
  const parts = match.slice(1).map(part => Number(part))
  if (parts.some(part => part > 255)) return false
  const [a, b] = parts
  if (a === 10 || a === 127) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true
  if (a === 169 && b === 254) return true
  return false
}

function isPrivateOrLinkLocalIpv6(host: string): boolean {
  const name = host.toLowerCase().split('%')[0] ?? ''
  if (name === '::1') return true
  const first = name.split(':')[0]
  if (!first) return false
  const value = Number.parseInt(first, 16)
  if (!Number.isFinite(value)) return false
  if (value >= 0xfe80 && value <= 0xfebf) return true
  if (value >= 0xfc00 && value <= 0xfdff) return true
  return false
}

function isLocalDevHost(host: string): boolean {
  const name = host.toLowerCase()
  if (name === 'localhost' || name.endsWith('.local')) return true
  return isPrivateIpv4(name) || isPrivateOrLinkLocalIpv6(name)
}

function assertHttpsReleaseUrl(url: string): void {
  let protocol: string
  try {
    protocol = new URL(url).protocol
  } catch {
    throw new Error(RELEASE_HTTPS_MESSAGE)
  }
  if (protocol !== 'https:') throw new Error(RELEASE_HTTPS_MESSAGE)
}

/** `__DEV__` wins. A runtime that never defines it (unit tests) is dev unless NODE_ENV is production. */
export function devApiRuntime(devFlag: boolean | undefined, nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  if (typeof devFlag === 'boolean') return devFlag
  return nodeEnv !== 'production'
}

export function apiBaseUrlFromEnv(
  input: { dev: boolean, EXPO_PUBLIC_API_URL?: string | null },
  constants?: { expoConfig?: { hostUri?: string | null } | null },
): string {
  const override = input.EXPO_PUBLIC_API_URL?.trim()
  if (override) {
    if (!input.dev) assertHttpsReleaseUrl(override)
    return override.replace(/\/+$/, '')
  }
  if (input.dev) {
    const hostUri = constants?.expoConfig?.hostUri
    if (typeof hostUri !== 'string' || !hostUri.trim()) throw new MissingDevHostError()
    const host = hostFromExpoHostUri(hostUri)
    if (!host || !isLocalDevHost(host)) return ''
    const literal = host.includes(':') ? `[${host}]` : host
    return `http://${literal}:${DEV_API_PORT}`
  }
  throw new Error(RELEASE_API_BASE_MESSAGE)
}
