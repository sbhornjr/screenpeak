import { expect, it } from 'vitest'
import {
    acquireSteamLeaseSql,
    heartbeatSteamLeaseSql,
    prepareSteamImportLock,
    steamLockHoldersSql,
    terminateSteamLockSql,
    type LeaseSql,
} from '@/lib/catalog/steam-import-lease'

const userId = '11111111-1111-4111-8111-111111111111'

it('names only the Steam import advisory lock and re-checks the backend before terminating', () => {
    expect(steamLockHoldersSql).toMatch(/1936745323::oid/)
    expect(steamLockHoldersSql).toMatch(/hashtext\(\$1\)/)
    expect(steamLockHoldersSql).toMatch(/datname = current_database\(\)/)
    expect(steamLockHoldersSql).toMatch(/usename = current_user/)
    expect(steamLockHoldersSql).toMatch(/pg_backend_pid\(\)/)
    expect(steamLockHoldersSql).not.toMatch(/1936745319/)
    expect(steamLockHoldersSql).not.toMatch(/1936745321/)
    expect(terminateSteamLockSql).toMatch(/a\.pid = \$1/)
    expect(terminateSteamLockSql).toMatch(/a\.backend_start::text = \$2/)
    expect(terminateSteamLockSql).toMatch(/hashtext\(\$3\)/)
    expect(acquireSteamLeaseSql).toMatch(/heartbeat_at < clock_timestamp\(\)/)
    expect(heartbeatSteamLeaseSql).toMatch(/owner_token = \$2::uuid/)
})

it('leaves a fresh import lock alone and terminates a stale one after re-checking its start time', async () => {
    const calls: { text: string; args: unknown[] }[] = []
    const started = '2026-10-13T00:00:00.000Z'
    const db: { unsafe: (text: string, args?: unknown[]) => Promise<Record<string, unknown>[]> } = {
        async unsafe(text: string, args: unknown[] = []) {
            calls.push({ text, args })
            if (text.includes('as stale')) return [{ pid: 42, backend_start: started, stale: false }]
            return []
        },
    }
    expect(await prepareSteamImportLock(db as unknown as LeaseSql, userId)).toBe('busy')
    expect(calls.some(call => call.text.startsWith('select pg_terminate_backend'))).toBe(false)

    calls.length = 0
    db.unsafe = async (text: string, args: unknown[] = []) => {
        calls.push({ text, args })
        if (text.includes('as stale')) return [{ pid: 42, backend_start: started, stale: true }]
        if (text.startsWith('select pg_terminate_backend')) return [{ terminated: true }]
        return []
    }
    expect(await prepareSteamImportLock(db as unknown as LeaseSql, userId)).toBe('clear')
    const terminate = calls.find(call => call.text.startsWith('select pg_terminate_backend'))
    expect(terminate?.args).toEqual([42, started, userId])
})

it('refuses to terminate a stale row that has no start time', async () => {
    const calls: string[] = []
    const db = {
        async unsafe(text: string) {
            calls.push(text)
            if (text.includes('as stale')) return [{ pid: 42, backend_start: null, stale: true }]
            return []
        },
    }
    expect(await prepareSteamImportLock(db as unknown as LeaseSql, userId)).toBe('clear')
    expect(calls.some(text => text.startsWith('select pg_terminate_backend'))).toBe(false)
})
