import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it.each([['--appids', '292030,1145360'], ['--main-games', '2']])('accepts valid CLI %s input before checking credentials', (flag, value) => {
    // Empty env vars override dotenv, guaranteeing this test cannot call Twitch.
    try {
        execFileSync(process.execPath, ['--import', 'tsx', resolve('scripts/audit-igdb.ts'), flag, value], {
            encoding: 'utf8', env: { ...process.env, TWITCH_CLIENT_ID: '', TWITCH_CLIENT_SECRET: '' },
            stdio: 'pipe',
        })
        throw new Error('Expected missing credentials to stop execution')
    } catch (error) {
        const result = error as { status?: number; stderr?: string }
        expect(result.status).toBe(1)
        expect(result.stderr).toContain('Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET')
    }
})
