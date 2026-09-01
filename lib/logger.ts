type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const isProduction = process.env.NODE_ENV === 'production'

const REDACTED = '[REDACTED]'
const SENSITIVE_KEY = /password|token|secret|apikey|api_key|authorization/i

// Recursively strips sensitive fields (passwords, tokens, keys) before anything
// reaches the console — request/response bodies can carry these in plaintext.
export function redact(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(redact)
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, val]) =>
                SENSITIVE_KEY.test(key) ? [key, REDACTED] : [key, redact(val)]
            )
        )
    }
    return value
}

function write(level: LogLevel, scope: string, message: string, meta?: Record<string, unknown>) {
    const entry = {
        time: new Date().toISOString(),
        level,
        scope,
        message,
        ...(meta ? redact(meta) as Record<string, unknown> : {}),
    }

    const line = JSON.stringify(entry)
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
}

export const logger = {
    // Verbose, per-call detail (request/response bodies). Silenced in production
    // so routine traffic doesn't flood prod logs — warn/error still always fire.
    debug: (scope: string, message: string, meta?: Record<string, unknown>) => {
        if (isProduction) return
        write('debug', scope, message, meta)
    },
    info: (scope: string, message: string, meta?: Record<string, unknown>) => write('info', scope, message, meta),
    warn: (scope: string, message: string, meta?: Record<string, unknown>) => write('warn', scope, message, meta),
    error: (scope: string, message: string, meta?: Record<string, unknown>) => write('error', scope, message, meta),
}
