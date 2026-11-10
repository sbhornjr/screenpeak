import assert from 'node:assert/strict'
import { test } from 'node:test'
import { safeSeedLines } from '../database.mjs'
import { sqlLiteral, sqlNullable } from '../fixtures.mjs'

test('sqlLiteral quotes a value and doubles embedded quotes', () => {
    assert.equal(sqlLiteral("Ada's picks"), "'Ada''s picks'")
    assert.equal(sqlLiteral(42), "'42'")
})

test('sqlNullable turns an empty string into NULL', () => {
    assert.equal(sqlNullable(''), 'NULL')
    assert.equal(sqlNullable('bio'), "'bio'")
})

test('safeSeedLines keeps the seed summary and drops everything else', () => {
    const log = [
        '> @screenpeak/web@0.1.0 seed:igdb',
        'TWITCH_CLIENT_SECRET=should-not-print',
        'igdb seed: wrote 100 games',
        '{',
        '  "games": 100',
        '}',
        'npm notice something',
    ].join('\n')
    assert.equal(safeSeedLines(log), ['igdb seed: wrote 100 games', '{', '  "games": 100', '}'].join('\n'))
})
