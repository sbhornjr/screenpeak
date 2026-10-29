import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { databaseUrl, scriptPath } from '../config.mjs'
import { drives } from '../drives/index.mjs'

const skillDir = join(dirname(fileURLToPath(import.meta.url)), '..')

test('scriptPath is the entry point, which drives re-run as doctor and up forks as gateway', () => {
    assert.equal(scriptPath, join(skillDir, 'verify-screenpeak.mjs'))
    assert.ok(existsSync(scriptPath))
})

test('every feature recipe has a drive and every drive has a recipe', () => {
    const recipes = readdirSync(join(skillDir, 'features'))
        .filter((name) => name.endsWith('.md') && name !== 'README.md')
        .map((name) => basename(name, '.md'))
        .sort()
    assert.deepEqual([...drives.keys()].sort(), recipes)
    for (const id of drives.keys()) assert.ok(existsSync(join(skillDir, 'drives', `${id}.mjs`)), `drives/${id}.mjs`)
})

test('the harness database is local and disposable', () => {
    const url = new URL(databaseUrl)
    assert.equal(url.hostname, '127.0.0.1')
    assert.match(url.pathname, /_copy$/)
})
