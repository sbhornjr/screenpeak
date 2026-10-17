import 'server-only'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { mobileSteamResultUrl, type SteamLinkIntent } from '@screenpeak/shared/api/steam'
import { steamAccounts, steamLinkIntents } from '@/db/schema'
import { db } from '@/lib/db'

/** Five minutes. A phone that misses the Steam sheet asks for a new intent. */
export const STEAM_LINK_INTENT_TTL_SECONDS = 5 * 60
const VERSION = 'v1'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STEAM_ID_RE = /^\d{17}$/

export class SteamLinkIntentConfigError extends Error {
    constructor() {
        super('STEAM_LINK_INTENT_SECRET is not set')
        this.name = 'SteamLinkIntentConfigError'
    }
}

function secret(): Buffer {
    const value = process.env.STEAM_LINK_INTENT_SECRET ?? ''
    if (value.length < 32) throw new SteamLinkIntentConfigError()
    return Buffer.from(value)
}

function isUuid(value: string): boolean {
    return UUID_RE.test(value)
}

/** Relative path the phone opens. Query values cannot add a second parameter or an absolute URL. */
export function steamLinkPath(state: string): string {
    return `/api/steam/link?${new URLSearchParams({ state, client: 'mobile' }).toString()}`
}

export function mobileSteamRedirect(ok: boolean): Response {
    return new Response(null, {
        status: 302,
        headers: { Location: mobileSteamResultUrl(ok), 'Cache-Control': 'no-store' },
    })
}

/** HMAC over `v1.userId.jti.exp`. The signature is not stored. */
export function signSteamLinkIntent(userId: string, jti: string, exp: number): string {
    if (!isUuid(userId) || !isUuid(jti) || !Number.isSafeInteger(exp)) {
        throw new Error('Invalid steam link intent')
    }
    const payload = `${VERSION}.${userId}.${jti}.${exp}`
    const mac = createHmac('sha256', secret()).update(payload).digest('base64url')
    return `${payload}.${mac}`
}

/** Null when the token is forged, the wrong shape, or past its own expiry. A missing secret throws. */
export function readSteamLinkIntent(token: string, now = Math.floor(Date.now() / 1000)): { userId: string, jti: string, exp: number } | null {
    const parts = token.split('.')
    if (parts.length !== 5 || parts[0] !== VERSION) return null
    const userId = parts[1] ?? ''
    const jti = parts[2] ?? ''
    const exp = Number(parts[3])
    const sig = parts[4] ?? ''
    if (!isUuid(userId) || !isUuid(jti) || !Number.isSafeInteger(exp)) return null
    if (exp <= now || exp > now + STEAM_LINK_INTENT_TTL_SECONDS) return null
    const payload = parts.slice(0, 4).join('.')
    const expected = createHmac('sha256', secret()).update(payload).digest()
    const actual = Buffer.from(sig, 'base64url')
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
    return { userId, jti, exp }
}

/** One outstanding intent per user. Older unspent rows for that user are deleted. */
export async function issueSteamLinkIntent(userId: string): Promise<SteamLinkIntent> {
    if (!isUuid(userId)) throw new Error('Invalid steam link intent')
    const jti = randomUUID()
    const exp = Math.floor(Date.now() / 1000) + STEAM_LINK_INTENT_TTL_SECONDS
    const state = signSteamLinkIntent(userId, jti, exp)
    const expiresAt = new Date(exp * 1000).toISOString()
    await db.transaction(async tx => {
        await tx.delete(steamLinkIntents).where(sql`
            ${steamLinkIntents.expiresAt} <= clock_timestamp()
            or (${steamLinkIntents.userId} = ${userId}::uuid and ${steamLinkIntents.consumedAt} is null)
        `)
        await tx.insert(steamLinkIntents).values({ id: jti, userId, expiresAt })
    })
    return { state, expiresAt, path: steamLinkPath(state) }
}

/** Live, unspent intent. A database error throws; null means missing, expired, or already used. */
export async function peekSteamLinkIntent(token: string): Promise<{ userId: string } | null> {
    const parsed = readSteamLinkIntent(token)
    if (!parsed) return null
    const rows = await db.select({ userId: steamLinkIntents.userId }).from(steamLinkIntents).where(and(
        eq(steamLinkIntents.id, parsed.jti),
        eq(steamLinkIntents.userId, parsed.userId),
        isNull(steamLinkIntents.consumedAt),
        sql`${steamLinkIntents.expiresAt} > clock_timestamp()`,
    )).limit(1)
    return rows[0] ?? null
}

/**
 * Spends the intent and writes the Steam id in one transaction. A second call
 * returns null and does not change the row. A unique Steam id rolls the spend back.
 */
export async function consumeSteamLinkIntent(token: string, steamId64: string): Promise<{ userId: string } | null> {
    if (!STEAM_ID_RE.test(steamId64)) return null
    const parsed = readSteamLinkIntent(token)
    if (!parsed) return null
    return db.transaction(async tx => {
        const spent = await tx.update(steamLinkIntents).set({
            consumedAt: sql`clock_timestamp()`,
        }).where(and(
            eq(steamLinkIntents.id, parsed.jti),
            eq(steamLinkIntents.userId, parsed.userId),
            isNull(steamLinkIntents.consumedAt),
            sql`${steamLinkIntents.expiresAt} > clock_timestamp()`,
        )).returning({ userId: steamLinkIntents.userId })
        const row = spent[0]
        if (!row) return null
        const linkedAt = new Date().toISOString()
        await tx.insert(steamAccounts).values({ userId: row.userId, steamId: steamId64, linkedAt }).onConflictDoUpdate({
            target: steamAccounts.userId,
            set: { steamId: steamId64, linkedAt },
        })
        return { userId: row.userId }
    })
}
