// Shared by the website (@sentry/nextjs) and the phone (@sentry/react-native).
// Both inits pass these hooks so a reset link, a bearer token, or a Supabase
// session cannot land in an event. This file stays free of the Sentry SDKs.

const REDACTED = '[REDACTED]'
const REDACTED_EMAIL = '[REDACTED_EMAIL]'

const SENSITIVE_QUERY_KEYS = new Set([
  'access_token',
  'code',
  'code_challenge',
  'code_verifier',
  'id_token',
  'refresh_token',
  'state',
  'token',
  'token_hash',
])

const SENSITIVE_KEYS = new Set([
  'access_token',
  'authorization',
  'code_challenge',
  'code_verifier',
  'email',
  'id_token',
  'password',
  'provider_refresh_token',
  'provider_token',
  'refresh_token',
  'token',
  'token_hash',
])

function scrubString(value: string): string {
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
  const bearer = /Bearer\s+\S+/gi
  const sessionCookie = /(sb-[A-Za-z0-9]+-auth-token(?:\.\d+)?=)[^;\s]+/gi
  const jwt = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g
  const stripped = value.includes('?') || value.includes('#') ? stripUrlSecrets(value) : value
  return stripped
    .replace(email, REDACTED_EMAIL)
    .replace(bearer, 'Bearer [REDACTED]')
    .replace(sessionCookie, `$1${REDACTED}`)
    .replace(jwt, REDACTED)
}

function stripParams(query: string): string {
  return query.split('&').filter(part => {
    if (part === '') return false
    const rawKey = part.split('=')[0] ?? ''
    let key = rawKey
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, ' '))
    } catch {
      key = rawKey
    }
    return !SENSITIVE_QUERY_KEYS.has(key.toLowerCase())
  }).join('&')
}

function stripUrlSecrets(value: string): string {
  const hashAt = value.indexOf('#')
  const beforeHash = hashAt === -1 ? value : value.slice(0, hashAt)
  const hash = hashAt === -1 ? null : value.slice(hashAt + 1)
  const queryAt = beforeHash.indexOf('?')
  let next = beforeHash
  if (queryAt !== -1) {
    const query = stripParams(beforeHash.slice(queryAt + 1))
    next = query ? `${beforeHash.slice(0, queryAt)}?${query}` : beforeHash.slice(0, queryAt)
  }
  if (hash === null) return next
  const strippedHash = stripParams(hash)
  return strippedHash ? `${next}#${strippedHash}` : next
}

function isCookieHeader(key: string): boolean {
  const name = key.toLowerCase()
  return name === 'cookie' || name === 'set-cookie'
}

function scrubValue(value: unknown): unknown {
  if (typeof value === 'string') return scrubString(value)
  if (typeof value !== 'object' || value === null) return value
  if (Array.isArray(value)) return value.map(scrubValue)
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      out[key] = REDACTED
    } else if (isCookieHeader(key)) {
      out[key] = Array.isArray(child)
        ? child.map(item => typeof item === 'string' ? scrubString(item) : scrubValue(item))
        : typeof child === 'string' ? scrubString(child) : scrubValue(child)
    } else {
      out[key] = scrubValue(child)
    }
  }
  return out
}

export function sentryBeforeSend<T>(event: T): T {
  return scrubValue(event) as T
}

export function sentryBeforeBreadcrumb<T>(breadcrumb: T): T {
  return scrubValue(breadcrumb) as T
}
