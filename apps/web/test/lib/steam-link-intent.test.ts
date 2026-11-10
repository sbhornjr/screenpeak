import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { randomBytes, randomUUID } from 'node:crypto'
import { tamper } from '../tamper'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

const SECRET = 'test-steam-link-intent-secret-32b'

afterEach(() => {
    delete process.env.STEAM_LINK_INTENT_SECRET
})

async function load() {
    process.env.STEAM_LINK_INTENT_SECRET = SECRET
    return import('@/lib/steam-link-intent')
}

describe('steam link intent tokens', () => {
    it('signs a 5-minute token that round-trips the user id and is not a cookie', async () => {
        const { signSteamLinkIntent, readSteamLinkIntent, STEAM_LINK_INTENT_TTL_SECONDS, steamLinkPath } = await load()
        const userId = randomUUID()
        const jti = randomUUID()
        const now = 1_700_000_000
        const token = signSteamLinkIntent(userId, jti, now + STEAM_LINK_INTENT_TTL_SECONDS)

        expect(STEAM_LINK_INTENT_TTL_SECONDS).toBe(300)
        expect(readSteamLinkIntent(token, now)).toEqual({ userId, jti, exp: now + 300 })
        expect(token.split('.').some(part => part === 'cookie')).toBe(false)

        const path = steamLinkPath(token)
        expect(path.startsWith('/api/steam/link?')).toBe(true)
        expect(path).toContain('client=mobile')
        expect(path).not.toMatch(/^https?:/)
        expect(steamLinkPath('a&return=https://evil.example')).toBe(
            '/api/steam/link?state=a%26return%3Dhttps%3A%2F%2Fevil.example&client=mobile',
        )
    })

    it('rejects a tampered user id, a bad signature, an expired token, and a short secret', async () => {
        const { signSteamLinkIntent, readSteamLinkIntent, SteamLinkIntentConfigError } = await load()
        const userId = randomUUID()
        const other = randomUUID()
        const jti = randomUUID()
        const now = 1_700_000_000
        const token = signSteamLinkIntent(userId, jti, now + 300)
        const parts = token.split('.')
        parts[1] = other
        expect(readSteamLinkIntent(parts.join('.'), now)).toBeNull()
        expect(readSteamLinkIntent(tamper(token), now)).toBeNull()
        expect(readSteamLinkIntent(token, now + 300)).toBeNull()

        process.env.STEAM_LINK_INTENT_SECRET = 'too-short'
        expect(() => signSteamLinkIntent(userId, jti, now + 300)).toThrow(/at least 32 characters/)
        delete process.env.STEAM_LINK_INTENT_SECRET
        expect(() => readSteamLinkIntent(token, now)).toThrow(/is not set/)
        expect(() => readSteamLinkIntent(token, now)).toThrow(SteamLinkIntentConfigError)
    })

    it('rejects a tampered signature for every base64url final character', async () => {
        const { signSteamLinkIntent, readSteamLinkIntent } = await load()
        const now = 1_700_000_000
        let token = ''
        let userId = ''
        let jti = ''
        for (let attempt = 0; attempt < 200; attempt++) {
            process.env.STEAM_LINK_INTENT_SECRET = randomBytes(32).toString('hex')
            userId = randomUUID()
            jti = randomUUID()
            token = signSteamLinkIntent(userId, jti, now + 300)
            const last = token.at(-1) ?? ''
            if (last.length === 1 && 'YZab'.includes(last)) break
        }
        const signature = token.slice(token.lastIndexOf('.') + 1)
        const digest = Buffer.from(signature, 'base64url')
        const accepted = { userId, jti, exp: now + 300 }
        expect(readSteamLinkIntent(token, now)).toEqual(accepted)
        expect(digest).toHaveLength(32)
        expect('YZab').toContain(signature.at(-1))

        const aliases = [...ALPHABET].filter(last => Buffer.from(signature.slice(0, -1) + last, 'base64url').equals(digest))
        expect(aliases).toEqual(['Y', 'Z', 'a', 'b'])
        for (const last of aliases) {
            expect(readSteamLinkIntent(token.slice(0, -1) + last, now)).toEqual(accepted)
        }
        for (const last of ALPHABET) {
            expect(readSteamLinkIntent(tamper(token.slice(0, -1) + last), now)).toBeNull()
        }
    })

    it('does not import cookie auth or Next headers', () => {
        const source = readFileSync(new URL('../../lib/steam-link-intent.ts', import.meta.url), 'utf8')
        expect(source).not.toMatch(/next\/headers|supabase-server|requireUser|getOptionalUser|cookies\(/)
    })
})
