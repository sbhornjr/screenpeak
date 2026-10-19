// Shared by the website (@sentry/nextjs) and the phone (@sentry/react-native).
// Both inits pass these hooks so a reset link, a bearer token, a Supabase
// session, or a Steam/PKCE secret cannot land in an event. This file stays
// free of the Sentry SDKs.

const REDACTED = '[REDACTED]'
const REDACTED_EMAIL = '[REDACTED_EMAIL]'

const SENSITIVE_QUERY_KEYS = new Set([
  'access_token',
  'code',
  'code_challenge',
  'code_verifier',
  'id_token',
  'openid.sig',
  'provider_refresh_token',
  'provider_token',
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
  'state',
  'token',
  'token_hash',
  'verifier',
])

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const BEARER = /Bearer\s+\S+/gi
const SESSION_COOKIE = /(sb-[^=;\s]+)=([^;\s]*)/gi
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g
const PASSWORD_ASSIGN = /password=[^\s&;]+/gi

type Ctx = {
  inRequestData: boolean
  console: boolean
  parentKey: string | null
}

const ROOT: Ctx = { inRequestData: false, console: false, parentKey: null }

function decodeQueryKey(rawKey: string): string {
  try {
    return decodeURIComponent(rawKey.replace(/\+/g, ' ')).toLowerCase()
  } catch {
    return rawKey.toLowerCase()
  }
}

function stripParams(query: string, decodeNested: boolean): string {
  const parts: string[] = []
  for (const part of query.split('&')) {
    if (part === '') continue
    const eq = part.indexOf('=')
    const rawKey = eq === -1 ? part : part.slice(0, eq)
    const rawValue = eq === -1 ? null : part.slice(eq + 1)
    if (SENSITIVE_QUERY_KEYS.has(decodeQueryKey(rawKey))) continue
    if (rawValue === null || !decodeNested) {
      parts.push(part)
      continue
    }
    let decoded: string
    try {
      decoded = decodeURIComponent(rawValue.replace(/\+/g, ' '))
    } catch {
      parts.push(part)
      continue
    }
    const stripped = scrubTextUrls(decoded, false)
    parts.push(stripped === decoded ? part : `${rawKey}=${encodeURIComponent(stripped)}`)
  }
  return parts.join('&')
}

function stripOneUrl(url: string, decodeNested: boolean): string {
  const hashAt = url.indexOf('#')
  const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt)
  const hash = hashAt === -1 ? null : url.slice(hashAt + 1)
  const queryAt = beforeHash.indexOf('?')
  let next = beforeHash
  if (queryAt !== -1) {
    const query = stripParams(beforeHash.slice(queryAt + 1), decodeNested)
    next = query ? `${beforeHash.slice(0, queryAt)}?${query}` : beforeHash.slice(0, queryAt)
  }
  if (hash === null) return next
  const strippedHash = stripParams(hash, decodeNested)
  return strippedHash ? `${next}#${strippedHash}` : next
}

function scrubTextUrls(value: string, decodeNested: boolean): string {
  const scheme = /[a-z][a-z0-9+.-]*:\/\/[^\s'"<>]+/gi
  const pathQuery = /\/[^\s?#'"]+\?[^\s#'"]*/g
  return value
    .replace(scheme, url => stripOneUrl(url, decodeNested))
    .replace(pathQuery, url => stripOneUrl(url, decodeNested))
}

function finishTokens(value: string, ctx: Ctx): string {
  let next = value
    .replace(EMAIL, REDACTED_EMAIL)
    .replace(BEARER, 'Bearer [REDACTED]')
    .replace(SESSION_COOKIE, `$1=${REDACTED}`)
    .replace(JWT, REDACTED)
  if (ctx.console) {
    next = next.replace(PASSWORD_ASSIGN, match => `${match.slice(0, match.indexOf('='))}=${REDACTED}`)
  }
  return next
}

function tryScrubJson(value: string, ctx: Ctx): string | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (parsed === null || typeof parsed !== 'object') return null
    const scrubbed = scrubValue(parsed, ctx)
    if (JSON.stringify(scrubbed) === JSON.stringify(parsed)) return value
    return JSON.stringify(scrubbed)
  } catch {
    return null
  }
}

function scrubString(value: string, ctx: Ctx): string {
  const json = tryScrubJson(value, ctx)
  if (json !== null) return json
  return finishTokens(scrubTextUrls(value, true), ctx)
}

function isCookieHeader(key: string): boolean {
  return key === 'cookie' || key === 'set-cookie'
}

function scrubCookieValue(value: unknown, ctx: Ctx): unknown {
  if (typeof value === 'string') return scrubString(value, ctx)
  if (Array.isArray(value)) return value.map(item => scrubCookieValue(item, ctx))
  return scrubValue(value, ctx)
}

function scrubObject(value: object, ctx: Ctx): Record<string, unknown> {
  const record = value as Record<string, unknown>
  const entries = Object.entries(record)
  const lowerKeys = entries.map(([key]) => key.toLowerCase())
  const scrubCode = ctx.inRequestData
    || lowerKeys.includes('verifier')
    || lowerKeys.includes('code_challenge')
  const consoleMode = ctx.console || record.category === 'console'
  const out: Record<string, unknown> = {}
  for (const [key, child] of entries) {
    const lower = key.toLowerCase()
    if (lower.startsWith('sb-')) {
      out[key] = REDACTED
      continue
    }
    if (SENSITIVE_KEYS.has(lower) || (lower === 'code' && scrubCode)) {
      out[key] = REDACTED
      continue
    }
    const childCtx: Ctx = {
      inRequestData: ctx.inRequestData || (ctx.parentKey === 'request' && lower === 'data'),
      console: consoleMode,
      parentKey: lower,
    }
    if (lower === 'query_string' && typeof child === 'string') {
      out[key] = finishTokens(stripParams(child, true), childCtx)
      continue
    }
    if (isCookieHeader(lower)) {
      out[key] = scrubCookieValue(child, childCtx)
      continue
    }
    out[key] = scrubValue(child, childCtx)
  }
  return out
}

function scrubValue(value: unknown, ctx: Ctx): unknown {
  if (typeof value === 'string') return scrubString(value, ctx)
  if (typeof value !== 'object' || value === null) return value
  if (Array.isArray(value)) return value.map(item => scrubValue(item, ctx))
  return scrubObject(value, ctx)
}

export function sentryBeforeSend<T>(event: T): T {
  return scrubValue(event, ROOT) as T
}

export function sentryBeforeBreadcrumb<T>(breadcrumb: T): T {
  return scrubValue(breadcrumb, ROOT) as T
}
