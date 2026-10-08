import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

function run(args: string[]) {
    return spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/inventory-igdb-baseline.ts'), ...args], {
        encoding: 'utf8', env: { ...process.env, DATABASE_POOL_URL: '', DATABASE_URL: '' },
    })
}
it('shows help without database credentials', () => {
    const result = run(['--help'])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('read-only')
})
it('refuses an export inside the repository before connecting', () => {
    const result = run(['--output-dir', resolve('private-export')])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('outside the repository')
})
it('fails explicitly when database credentials are missing', () => {
    const result = run(['--output-dir', '/tmp/screenpeak-inventory-test-do-not-create'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Set DATABASE_POOL_URL')
})
