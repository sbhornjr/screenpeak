// Dev talks to `npm run dev` on the same machine Metro is using. Expo's hostUri
// is that machine (`192.168.1.20:8081`); the API is Next's port, 3000.
// EXPO_PUBLIC_API_URL overrides it (the verify harness, a non-default port).
// A release build does not guess a LAN address: it uses that configured origin.

const DEV_API_PORT = 3000

const RELEASE_API_BASE_MESSAGE =
  'This release build has no API base URL. Set EXPO_PUBLIC_API_URL to the ScreenPeak site URL before shipping.'

export function hostFromExpoHostUri(hostUri: string): string | null {
  const trimmed = hostUri.trim()
  if (!trimmed) return null
  const withoutScheme = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  const authority = withoutScheme.split('/')[0]?.split('?')[0] ?? ''
  if (!authority) return null
  if (authority.startsWith('[')) {
    const end = authority.indexOf(']')
    if (end < 0) return null
    return authority.slice(1, end) || null
  }
  const colon = authority.indexOf(':')
  const host = colon === -1 ? authority : authority.slice(0, colon)
  return host || null
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
  if (override) return override.replace(/\/+$/, '')
  if (input.dev) {
    const hostUri = constants?.expoConfig?.hostUri
    const host = typeof hostUri === 'string' ? hostFromExpoHostUri(hostUri) : null
    if (!host) return ''
    const literal = host.includes(':') ? `[${host}]` : host
    return `http://${literal}:${DEV_API_PORT}`
  }
  throw new Error(RELEASE_API_BASE_MESSAGE)
}
