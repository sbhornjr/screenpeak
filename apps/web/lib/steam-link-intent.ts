import 'server-only'
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { mobileSteamCodeUrl, mobileSteamResultUrl, type SteamLinkIntent } from '@screenpeak/shared/api/steam'
import { steamAccounts, steamLinkIntents, users } from '@/db/schema'
import { db } from '@/lib/db'

/** Five minutes. A phone that misses the Steam sheet asks for a new intent. */
export const STEAM_LINK_INTENT_TTL_SECONDS = 5 * 60
const VERSION = 'v1'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STEAM_ID_RE = /^[0-9]{17}$/
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43,128}$/
const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/
const CODE_RE = /^[A-Za-z0-9_-]{43,128}$/

export class SteamLinkIntentConfigError extends Error {
    constructor(reason: 'missing' | 'short') {
        super(reason === 'missing'
            ? 'STEAM_LINK_INTENT_SECRET is not set'
            : 'STEAM_LINK_INTENT_SECRET must be at least 32 characters')
        this.name = 'SteamLinkIntentConfigError'
    }
}

function secret(): Buffer {
    const value = process.env.STEAM_LINK_INTENT_SECRET
    if (value == null || value === '') throw new SteamLinkIntentConfigError('missing')
    if (value.length < 32) throw new SteamLinkIntentConfigError('short')
    return Buffer.from(value)
}

function isUuid(value: string): boolean {
    return UUID_RE.test(value)
}

function sha256Base64Url(value: string): string {
    return createHash('sha256').update(value).digest('base64url')
}

function sameBytes(left: string, right: string): boolean {
    const a = Buffer.from(left)
    const b = Buffer.from(right)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
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

export function mobileSteamCodeRedirect(code: string): Response {
    return new Response(null, {
        status: 302,
        headers: { Location: mobileSteamCodeUrl(code), 'Cache-Control': 'no-store' },
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

/** One outstanding intent per user. The users row lock serializes a parallel issue. */
export async function issueSteamLinkIntent(userId: string, codeChallenge: string): Promise<SteamLinkIntent> {
    if (!isUuid(userId) || !CHALLENGE_RE.test(codeChallenge)) throw new Error('Invalid steam link intent')
    const jti = randomUUID()
    const exp = Math.floor(Date.now() / 1000) + STEAM_LINK_INTENT_TTL_SECONDS
    const state = signSteamLinkIntent(userId, jti, exp)
    const expiresAt = new Date(exp * 1000).toISOString()
    await db.transaction(async tx => {
        const locked = await tx.execute(sql`select ${users.id} from ${users} where ${users.id} = ${userId}::uuid for update`) as unknown as { id: string }[]
        if (!locked.length) throw new Error('Invalid steam link intent')
        await tx.delete(steamLinkIntents).where(sql`
            ${steamLinkIntents.expiresAt} <= clock_timestamp()
            or (${steamLinkIntents.userId} = ${userId}::uuid and ${steamLinkIntents.consumedAt} is null)
        `)
        await tx.insert(steamLinkIntents).values({ id: jti, userId, codeChallenge, expiresAt })
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
 * Records the Steam id OpenID just verified and returns a one-time code.
 * Does not write steam_accounts. A second call returns null.
 */
export async function stageSteamLink(token: string, steamId64: string): Promise<string | null> {
    if (!STEAM_ID_RE.test(steamId64)) return null
    const parsed = readSteamLinkIntent(token)
    if (!parsed) return null
    const code = randomBytes(32).toString('base64url')
    const completionCodeHash = sha256Base64Url(code)
    const staged = await db.update(steamLinkIntents).set({
        steamId: steamId64,
        completionCodeHash,
    }).where(and(
        eq(steamLinkIntents.id, parsed.jti),
        eq(steamLinkIntents.userId, parsed.userId),
        isNull(steamLinkIntents.consumedAt),
        isNull(steamLinkIntents.steamId),
        sql`${steamLinkIntents.expiresAt} > clock_timestamp()`,
    )).returning({ id: steamLinkIntents.id })
    return staged[0] ? code : null
}

/**
 * Commits the link. The bearer user, the intent user, the stored challenge,
 * and a still-valid code must all match. The Steam id was stored only after
 * the signed return_to state matched.
 */
export async function completeSteamLink(userId: string, code: string, verifier: string): Promise<{ userId: string } | null> {
    if (!isUuid(userId) || !CODE_RE.test(code) || !VERIFIER_RE.test(verifier)) return null
    const completionCodeHash = sha256Base64Url(code)
    const challenge = sha256Base64Url(verifier)
    return db.transaction(async tx => {
        const rows = await tx.select({
            id: steamLinkIntents.id,
            userId: steamLinkIntents.userId,
            codeChallenge: steamLinkIntents.codeChallenge,
            steamId: steamLinkIntents.steamId,
        }).from(steamLinkIntents).where(and(
            eq(steamLinkIntents.completionCodeHash, completionCodeHash),
            isNull(steamLinkIntents.consumedAt),
            sql`${steamLinkIntents.expiresAt} > clock_timestamp()`,
        )).for('update')
        const row = rows[0]
        if (!row?.steamId) return null
        if (row.userId !== userId || !sameBytes(row.codeChallenge, challenge)) return null
        const spent = await tx.update(steamLinkIntents).set({
            consumedAt: sql`clock_timestamp()`,
        }).where(and(
            eq(steamLinkIntents.id, row.id),
            isNull(steamLinkIntents.consumedAt),
        )).returning({ id: steamLinkIntents.id })
        if (!spent[0]) return null
        const linkedAt = new Date().toISOString()
        await tx.insert(steamAccounts).values({ userId: row.userId, steamId: row.steamId, linkedAt }).onConflictDoUpdate({
            target: steamAccounts.userId,
            set: { steamId: row.steamId, linkedAt },
        })
        return { userId: row.userId }
    })
}

/** Expired rows and rows the phone already exchanged. A live intent stays. */
export async function deleteSpentSteamLinkIntents(): Promise<number> {
    const rows = await db.execute(sql`
        delete from steam_link_intents
        where expires_at <= clock_timestamp() or consumed_at is not null
        returning id
    `) as unknown as { id: string }[]
    return rows.length
}
