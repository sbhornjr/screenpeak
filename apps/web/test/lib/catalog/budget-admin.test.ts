import { expect, it } from 'vitest'
import { clearIgdbBudget, stuckBackendSql, terminateStuckBackendSql, type BudgetSql } from '@/lib/catalog/budget-admin'

it('terminates only this seed’s own stale sessions', () => {
    expect(stuckBackendSql).toMatch(/1936745319/)
    expect(stuckBackendSql).toMatch(/1936745320/)
    expect(stuckBackendSql).toMatch(/1936745322/)
    expect(stuckBackendSql).toMatch(/datname = current_database\(\)/)
    expect(stuckBackendSql).toMatch(/usename = current_user/)
    expect(stuckBackendSql).toMatch(/a\.pid <> pg_backend_pid\(\)/)
    expect(stuckBackendSql).toMatch(/idle in transaction%/)
    expect(stuckBackendSql).toMatch(/15 seconds/)
    expect(stuckBackendSql).toMatch(/n\.nspname = 'igdb_private'/)
    expect(stuckBackendSql).not.toMatch(/public/)
    expect(stuckBackendSql).not.toMatch(/1936745321/)
    expect(stuckBackendSql).not.toMatch(/1936745323/)
    expect(terminateStuckBackendSql).toMatch(/a\.pid = \$1/)
    expect(terminateStuckBackendSql).toMatch(/a\.backend_start = \$2/)
    expect(terminateStuckBackendSql).toMatch(/datname = current_database\(\)/)
    expect(terminateStuckBackendSql).toMatch(/usename = current_user/)
    expect(terminateStuckBackendSql).toMatch(/a\.pid <> pg_backend_pid\(\)/)
})

it('re-checks the backend id and start time before terminating', async () => {
    const queries: { text: string; args: unknown[] }[] = []
    const started = '2026-10-13T00:00:00.000Z'
    const sql = {
        async unsafe(text: string, args: unknown[] = []) {
            queries.push({ text, args })
            if (text.startsWith('select pg_terminate_backend')) return [{ terminated: true }]
            if (text.includes('classid')) return [{ pid: 42, backend_start: started }]
            if (text.includes('request_leases')) return [{ n: 3 }]
            if (text.includes('request_budgets')) return [{ n: 1 }]
            return []
        },
    }
    const report = await clearIgdbBudget(sql as unknown as BudgetSql)
    expect(report).toEqual({ terminated: [42], deletedLeases: 3, budgetsReset: 1 })
    const terminate = queries.filter(query => query.text.startsWith('select pg_terminate_backend'))
    expect(terminate).toHaveLength(1)
    expect(terminate[0].args).toEqual([42, started])
})

it('refuses a backend row without a start time', async () => {
    const sql = {
        async unsafe(text: string) {
            if (text.includes('classid')) return [{ pid: 42, backend_start: null }]
            return []
        },
    }
    await expect(clearIgdbBudget(sql as unknown as BudgetSql)).rejects.toThrow(/without a start time/)
})

it('refuses a lock it still cannot take', async () => {
    const sql = { async unsafe() { throw new Error('canceling statement due to lock timeout') } }
    await expect(clearIgdbBudget(sql as unknown as BudgetSql)).rejects.toThrow(/Stop every seed/)
})
