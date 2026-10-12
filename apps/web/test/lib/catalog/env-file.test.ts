import { expect, it } from 'vitest'
import { applyEnvFile, parseEnvFile } from '@/lib/catalog/env-file'

it('parses spaced, exported, and quoted env lines without overriding existing values', () => {
    expect(parseEnvFile(`
# comment
TWITCH_CLIENT_ID = twitch-id
export TWITCH_CLIENT_SECRET = "twitch-secret"
DATABASE_URL = 'postgres://local/db'
ALREADY = from-file
BLANK = 
`)).toEqual({
        TWITCH_CLIENT_ID: 'twitch-id',
        TWITCH_CLIENT_SECRET: 'twitch-secret',
        DATABASE_URL: 'postgres://local/db',
        ALREADY: 'from-file',
        BLANK: '',
    })
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', ALREADY: '', TWITCH_CLIENT_ID: 'from-shell' }
    expect(applyEnvFile('ALREADY = file\nTWITCH_CLIENT_ID = file\nNEW = value\n', env)).toEqual(['NEW'])
    expect(env).toMatchObject({ ALREADY: '', TWITCH_CLIENT_ID: 'from-shell', NEW: 'value' })
})
