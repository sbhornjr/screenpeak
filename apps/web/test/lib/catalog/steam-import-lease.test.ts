import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { acquireSteamLeaseSql, claimSteamLeaseSql, heartbeatSteamLeaseSql, releaseSteamLeaseSql } from '@/lib/catalog/steam-import-lease'

it('keeps the lease row as the only Steam import mutex', () => {
    expect(acquireSteamLeaseSql).toMatch(/on conflict \(user_id\)/)
    expect(acquireSteamLeaseSql).toMatch(/heartbeat_at < clock_timestamp\(\)/)
    expect(heartbeatSteamLeaseSql).toMatch(/owner_token = \$2::uuid/)
    expect(claimSteamLeaseSql).toMatch(/owner_token = \$2::uuid/)
    expect(claimSteamLeaseSql).toMatch(/returning owner_token/)
    expect(releaseSteamLeaseSql).toMatch(/owner_token = \$2::uuid/)
    const sql = [acquireSteamLeaseSql, heartbeatSteamLeaseSql, claimSteamLeaseSql, releaseSteamLeaseSql].join('\n')
    expect(sql).not.toMatch(/pg_advisory/)
    expect(sql).not.toMatch(/pg_terminate_backend/)
    expect(sql).not.toMatch(/1936745323/)
})

it('does not acquire or terminate a session advisory lock on the import path', () => {
    const lease = readFileSync(new URL('../../../lib/catalog/steam-import-lease.ts', import.meta.url), 'utf8')
    const importer = readFileSync(new URL('../../../lib/catalog/steam-import.ts', import.meta.url), 'utf8')
    for (const source of [lease, importer]) {
        expect(source).not.toMatch(/pg_advisory_lock/)
        expect(source).not.toMatch(/pg_try_advisory_lock/)
        expect(source).not.toMatch(/pg_terminate_backend/)
        expect(source).not.toMatch(/1936745323/)
    }
    expect(importer).toContain('owner_token = ${lease.token}::uuid')
    expect(importer).toContain('igdb_private.steam_import_runs')
})
