import { existsSync, readFileSync } from 'node:fs'

/**
 * Read KEY=value lines. Does not override variables already set in the
 * environment, including empty strings. Tolerates `export`, spaces around `=`,
 * and a single pair of matching quotes.
 */
export function parseEnvFile(text: string): Record<string, string> {
    const values: Record<string, string> = {}
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) continue
        const body = /^export\s+/.test(line) ? line.replace(/^export\s+/, '') : line
        const separator = body.indexOf('=')
        if (separator === -1) continue
        const key = body.slice(0, separator).trim()
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
        let value = body.slice(separator + 1).trim()
        if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))))
            value = value.slice(1, -1)
        values[key] = value
    }
    return values
}

export function applyEnvFile(text: string, env: NodeJS.ProcessEnv = process.env): string[] {
    const applied: string[] = []
    for (const [key, value] of Object.entries(parseEnvFile(text))) {
        if (env[key] !== undefined) continue
        env[key] = value
        applied.push(key)
    }
    return applied
}

/** Load apps/web/.env.local when it exists. Missing file is not an error. */
export function loadEnvFile(path: string, env: NodeJS.ProcessEnv = process.env): boolean {
    if (!existsSync(path)) return false
    applyEnvFile(readFileSync(path, 'utf8'), env)
    return true
}
