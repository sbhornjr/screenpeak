import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { pkceMatches, signJwt, verifyJwt } from '../jwt.mjs'

const secret = 'test-secret'
const later = () => Math.floor(Date.now() / 1000) + 600

test('verifyJwt returns the payload signJwt signed', () => {
    const payload = { sub: 'user-1', role: 'authenticated', exp: later() }
    assert.deepEqual(verifyJwt(signJwt(payload, secret), secret), payload)
})

test('verifyJwt rejects another secret, a changed body, an expired token, and a malformed token', () => {
    const token = signJwt({ sub: 'user-1', exp: later() }, secret)
    assert.equal(verifyJwt(token, 'other-secret'), null)
    const [header, , signature] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ sub: 'user-2', exp: later() })).toString('base64url')
    assert.equal(verifyJwt(`${header}.${forged}.${signature}`, secret), null)
    assert.equal(verifyJwt(signJwt({ sub: 'user-1', exp: 1 }, secret), secret), null)
    assert.equal(verifyJwt('not-a-jwt', secret), null)
})

test('pkceMatches checks S256 by default and plain only when asked', () => {
    const verifier = 'a-verifier-string'
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    assert.equal(pkceMatches('s256', challenge, verifier), true)
    assert.equal(pkceMatches(undefined, challenge, verifier), true)
    assert.equal(pkceMatches('s256', challenge, 'wrong'), false)
    assert.equal(pkceMatches('plain', verifier, verifier), true)
    assert.equal(pkceMatches('plain', challenge, verifier), false)
    assert.equal(pkceMatches('s256', null, verifier), false)
    assert.equal(pkceMatches('s256', challenge, ''), false)
})
