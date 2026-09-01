import { logger, redact } from './logger'

const MAX_LOGGED_BODY_CHARS = 2000

function truncate(str: string): string {
    return str.length > MAX_LOGGED_BODY_CHARS
        ? `${str.slice(0, MAX_LOGGED_BODY_CHARS)}…[truncated ${str.length} chars]`
        : str
}

function safeJsonParse(text: string): unknown {
    if (!text) return undefined
    try {
        return JSON.parse(text)
    } catch {
        return text
    }
}

function loggedBody(value: unknown): string | undefined {
    if (value === undefined) return undefined
    return truncate(JSON.stringify(redact(value)))
}

// Supabase's REST/RPC calls all go through PostgREST as `<table>` or `rpc/<fn>`
// under /rest/v1, with auth under /auth/v1 and file storage under /storage/v1.
// Pulling the table/function name out of the path makes logs scannable at a
// glance instead of just dumping the raw URL.
function describeRequest(url: string): { api: string; resource: string; query: string } {
    const { pathname, search } = new URL(url)
    const segments = pathname.split('/').filter(Boolean)
    const [api, , ...rest] = segments
    const resource = rest.join('/') || pathname
    return { api: api ?? 'unknown', resource, query: search }
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
    if (init?.method) return init.method
    if (typeof input === 'object' && 'method' in input) return input.method
    return 'GET'
}

function requestUrl(input: RequestInfo | URL): string {
    return typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
}

// Wraps the fetch a Supabase client uses under the hood so every request it
// makes — table queries, RPCs, auth, storage — gets logged with its query and
// response, regardless of which of the app's three Supabase clients issued it.
export function createLoggingFetch(clientLabel: string): typeof fetch {
    return async (input, init) => {
        const url = requestUrl(input)
        const method = requestMethod(input, init)
        const { api, resource, query } = describeRequest(url)
        const scope = `supabase:${clientLabel}`
        const label = `${method} ${api}/${resource}`
        const start = Date.now()

        logger.debug(scope, `→ ${label}`, {
            query: query || undefined,
            body: loggedBody(init?.body ? safeJsonParse(String(init.body)) : undefined),
        })

        let response: Response
        try {
            response = await fetch(input, init)
        } catch (err) {
            logger.error(scope, `✗ ${label} — network error`, {
                query: query || undefined,
                durationMs: Date.now() - start,
                error: err instanceof Error ? err.message : String(err),
            })
            throw err
        }

        const durationMs = Date.now() - start
        const bodyText = await response.clone().text().catch(() => '')
        const parsedBody = safeJsonParse(bodyText)

        if (!response.ok) {
            logger.error(scope, `✗ ${label} — ${response.status} ${response.statusText}`, {
                query: query || undefined,
                status: response.status,
                durationMs,
                error: redact(parsedBody),
            })
        } else {
            logger.debug(scope, `← ${label} — ${response.status} (${durationMs}ms)`, {
                query: query || undefined,
                response: loggedBody(parsedBody),
            })
        }

        return response
    }
}
