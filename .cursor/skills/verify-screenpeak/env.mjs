// apps/web/.env.local: written only when absent or carrying the harness marker.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { appPort, databaseUrl, envMarker, envPath, gatewayPort } from './config.mjs'
import { signJwt } from './jwt.mjs'

export function twitchReady() {
    return Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET)
}

export function readEnvFile() {
    if (!existsSync(envPath)) return null
    return readFileSync(envPath, 'utf8')
}

export function writeEnv(secret) {
    const now = Math.floor(Date.now() / 1000)
    const anon = signJwt({ role: 'anon', iss: 'verify-screenpeak', iat: now, exp: now + 60 * 60 * 24 * 3650 }, secret)
    // Signed with the gateway's local secret, so it only works against the gateway.
    const service = signJwt({ role: 'service_role', iss: 'verify-screenpeak', iat: now, exp: now + 60 * 60 * 24 * 3650 }, secret)
    const existing = readEnvFile()
    if (existing && !existing.includes(envMarker)) {
        throw new Error(`Refusing to overwrite ${envPath}. It was not written by verify-screenpeak.`)
    }
    const r2FromEnv = process.env.R2_PUBLIC_URL
    const r2Substituted = !r2FromEnv
    const r2 = r2FromEnv || 'https://verify-screenpeak.invalid'
    const body = [
        `# ${envMarker}. Safe to delete. Local disposable database only.`,
        `LOCAL_DATABASE_URL=${databaseUrl}`,
        `DATABASE_URL=${databaseUrl}`,
        `DATABASE_POOL_URL=${databaseUrl}`,
        `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:${gatewayPort}`,
        `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}`,
        `SUPABASE_SECRET_KEY=${service}`,
        `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:${appPort}`,
        `R2_PUBLIC_URL=${r2}`,
        '',
    ].join('\n')
    writeFileSync(envPath, body)
    return { anon, r2Substituted, r2 }
}

/** True when this stack's env has the local service key that account deletion needs. */
export function serviceKeyWritten() {
    const text = readEnvFile()
    return Boolean(text && text.includes(envMarker) && /^SUPABASE_SECRET_KEY=.+$/m.test(text))
}

export function readPublicEnv() {
    const text = readEnvFile()
    if (!text || !text.includes(envMarker)) {
        throw new Error('apps/web/.env.local is not the verify-screenpeak stack. Run up first.')
    }
    const url = text.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim()
    const anon = text.match(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)$/m)?.[1]?.trim()
    if (!url || !anon) throw new Error('Local env is missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.')
    return { url, anon }
}
