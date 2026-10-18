import assert from 'node:assert/strict'

/** Flip the last character. A fixed replacement is a no-op when the value already ends in that character. */
export function tamper(value: string): string {
    const last = value.at(-1)
    if (last === undefined) throw new Error('tamper() needs a non-empty value')
    const flipped = last === 'a' ? 'b' : 'a'
    const result = `${value.slice(0, -1)}${flipped}`
    assert.notStrictEqual(result, value, 'tamper() left the value unchanged')
    return result
}
