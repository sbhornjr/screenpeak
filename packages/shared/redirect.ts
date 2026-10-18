// Sanitizes a user-supplied post-auth redirect target (the `next` query param
// on /auth/confirm) down to a same-origin path, falling back to "/".
//
// Callers build the redirect as `${origin}${path}`, so anything that isn't a
// plain path is dangerous: "@evil.com" becomes `https://site@evil.com` (userinfo
// → evil.com) and ".evil.com" becomes `https://site.evil.com`. The prefix check
// rejects those plus protocol-relative "//evil.com" and "/\evil.com"; resolving
// through URL then catches anything the parser would normalize into another
// origin (e.g. a tab in "/\t/evil.com" is stripped → "//evil.com").
//
// The shared tsconfig omits the DOM lib. URL is the runtime global (Node,
// Hermes, and browsers).

type UrlParts = {
    origin: string
    pathname: string
    search: string
    hash: string
}

function parseUrl(input: string, base: string): UrlParts | null {
    const URLCtor = (globalThis as { URL?: new (input: string, base?: string) => UrlParts }).URL
    if (!URLCtor) return null
    try {
        return new URLCtor(input, base)
    } catch {
        return null
    }
}

export function safeNextPath(raw: string | null | undefined, origin: string): string {
    if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/'
    const url = parseUrl(raw, origin)
    if (!url || url.origin !== origin) return '/'
    return `${url.pathname}${url.search}${url.hash}`
}
