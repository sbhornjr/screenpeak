import assert from 'node:assert/strict'

/** Flip a data bit in the signature. A 32-byte HMAC encodes to 43 base64url
 *  characters, and the last one carries two unused bits, so swapping that
 *  character among Y, Z, a, and b leaves the decoded digest unchanged. */
export function tamper(value: string): string {
    if (value.length === 0) throw new Error('tamper() needs a non-empty value')
    const splitAt = value.lastIndexOf('.')
    const prefix = splitAt === -1 ? '' : value.slice(0, splitAt + 1)
    const signature = splitAt === -1 ? value : value.slice(splitAt + 1)
    if (signature.length === 0) throw new Error('tamper() needs a non-empty value')
    const original = Buffer.from(signature, 'base64url')
    if (original.length === 0) throw new Error('tamper() needs a decodable signature')
    const flipped = Buffer.from(original)
    flipped[0] ^= 0x01
    const next = flipped.toString('base64url')
    const decoded = Buffer.from(next, 'base64url')
    assert.ok(
        decoded.length === original.length && !decoded.equals(original),
        'tamper() left the decoded signature unchanged',
    )
    return prefix + next
}
