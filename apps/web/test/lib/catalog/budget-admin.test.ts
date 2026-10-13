import { expect, it } from 'vitest'
import { clearIgdbBudget, stuckBackendSql, type BudgetSql } from '@/lib/catalog/budget-admin'

it('clears advisory and catalogue locks left idle by a killed seed', () => {
    expect(stuckBackendSql).toMatch(/locktype = 'advisory'/)
    expect(stuckBackendSql).toMatch(/n\.nspname in \('igdb_private', 'public'\)/)
    expect(stuckBackendSql).toMatch(/idle in transaction%/)
    expect(stuckBackendSql).toMatch(/pg_backend_pid\(\)/)
    expect(stuckBackendSql).toMatch(/15 seconds/)
    expect(stuckBackendSql).not.toMatch(/nspname = 'igdb_private'/)
})

it('terminates the stuck backends and resets the rate-limit clock', async () => {
    const queries: string[] = []
    const sql = {
        async unsafe(text: string) {
            queries.push(text)
            if (text.includes('pg_stat_activity')) return [{ pid: 42 }]
            if (text.startsWith('select pg_terminate_backend')) return [{ terminated: true }]
            if (text.includes('request_leases')) return [{ n: 3 }]
            if (text.includes('request_budgets')) return [{ n: 1 }]
            return []
        },
    }
    const report = await clearIgdbBudget(sql as unknown as BudgetSql)
    expect(report).toEqual({ terminated: [42], deletedLeases: 3, budgetsReset: 1 })
    expect(queries.filter(query => query.startsWith('select pg_terminate_backend'))).toHaveLength(1)
    expect(queries.some(query => query.includes('advisory'))).toBe(true)
})

it('refuses a lock it still cannot take', async () => {
    const sql = { async unsafe() { throw new Error('canceling statement due to lock timeout') } }
    await expect(clearIgdbBudget(sql as unknown as BudgetSql)).rejects.toThrow(/Stop every seed/)
})
