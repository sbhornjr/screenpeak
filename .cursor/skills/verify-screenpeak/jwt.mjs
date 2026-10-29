// HS256 JWTs and PKCE checks for the local Auth stand-in. Pure functions.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

function b64url(value) {
    return Buffer.from(value).toString('base64url')
}

export function signJwt(payload, secret) {
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const body = b64url(JSON.stringify(payload))
    const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
    return `${header}.${body}.${signature}`
}

export function verifyJwt(token, secret) {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, body, signature] = parts
    const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
    const actualBuf = Buffer.from(signature)
    const expectedBuf = Buffer.from(expected)
    if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
}

export function pkceMatches(method, challenge, verifier) {
    if (!challenge || !verifier) return false
    if (method === 'plain') return verifier === challenge
    return createHash('sha256').update(verifier).digest('base64url') === challenge
}
