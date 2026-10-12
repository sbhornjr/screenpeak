import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import { randomUUID, createHash } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import postgres from 'postgres'
import { clearIgdbBudget } from '@/lib/catalog/budget-admin'

// Explicit disposable local DB only; never falls back to DATABASE_POOL_URL.
const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('Set TEST_DATABASE_URL to a disposable local database.')
const parsed = new URL(url)
if (!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test'))
    throw new Error('IGDB integration tests require a local database with a name ending in _test.')
const a = postgres(url, { max: 1, prepare: false })
const b = postgres(url, { max: 1, prepare: false })
const key = () => createHash('sha256').update(randomUUID()).digest('hex')
const keys: string[] = []
const makeKey = () => { const value = key(); keys.push(value); return value }
const delay = (ms: number) => new Promise(r => setTimeout(r,ms))
beforeAll(async()=>{
    // Roles emulate Supabase's browser roles only in this explicitly disposable cluster.
    await a`do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon; end if; if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$`
    const [exists] = await a`select to_regnamespace('igdb_private') as name`
    if (!exists.name) await a.unsafe(await readFile('db/migrations/0003_igdb_request_budget.sql','utf8'))
})
afterAll(async()=>{
    for(const id of keys) await a`delete from igdb_private.request_budgets where credential_key=${id}`
    await Promise.all([a.end(),b.end()])
})
async function acquire(client: typeof a, id:string) {
    for(let n=0;n<100;n++) {
        const [row]=await client`select * from igdb_private.acquire_request_lease(${id})`
        if(row.lease_id) return row.lease_id as string
        await delay(Math.max(10,Number(row.wait_ms)))
    }
    throw new Error('Budget did not become available')
}
it('coordinates separate connections: no rolling second exceeds four grants',async()=>{
    const id=makeKey(),starts:number[]=[]
    await Promise.all(Array.from({length:8},async(_,i)=>{
        const client=i%2?a:b
        const lease=await acquire(client,id);starts.push(performance.now())
        await client`select igdb_private.release_request_lease(${id},${lease}::uuid)`
    }))
    starts.sort((x,y)=>x-y)
    for(const start of starts) expect(starts.filter(t=>t>=start&&t<start+1000).length).toBeLessThanOrEqual(4)
    for(let i=1;i<starts.length;i++) expect(starts[i]-starts[i-1]).toBeGreaterThanOrEqual(300)
})
it('caps active leases at four and recovers after abandoned leases expire',async()=>{
    const id=makeKey()
    const leases=[]
    for(let i=0;i<4;i++) leases.push(await acquire(i%2?a:b,id))
    const [blocked]=await b`select * from igdb_private.acquire_request_lease(${id})`
    expect(blocked.lease_id).toBeNull()
    const [count]=await a`select count(*)::int as n from igdb_private.request_leases where credential_key=${id}`
    expect(count.n).toBe(4)
    // Exercise actual expiry predicate without waiting fifteen seconds.
    await a`update igdb_private.request_leases set expires_at=clock_timestamp()-interval '1 second' where credential_key=${id}`
    await delay(700)
    expect(await acquire(b,id)).toEqual(expect.any(String))
})
it('does not release a different credential scope and denies browser access',async()=>{
    const id=makeKey(),other=makeKey(),lease=await acquire(a,id)
    await a`select igdb_private.release_request_lease(${other},${lease}::uuid)`
    const [row]=await a`select count(*)::int as n from igdb_private.request_leases where id=${lease}::uuid`
    expect(row.n).toBe(1)
    for(const role of ['anon','authenticated']) {
        const [permission]=await a`select has_schema_privilege(${role}, 'igdb_private','USAGE') as schema_access,
          has_table_privilege(${role}, 'igdb_private.request_leases','SELECT') as table_access,
          has_function_privilege(${role}, 'igdb_private.acquire_request_lease(text)','EXECUTE') as execute_access`
        expect(permission).toEqual({schema_access:false,table_access:false,execute_access:false})
    }
})

it('coordinates actual adapter clients in independent Node processes',async()=>{
    const clientId=randomUUID(),scope=createHash('sha256').update(clientId).digest('hex');keys.push(scope)
    const outputs=await Promise.all([0,1].map(()=>promisify(execFile)(process.execPath,
        ['--conditions=react-server','--import','tsx','test/integration/igdb-budget-worker.ts',clientId],
        {env:{...process.env,DATABASE_POOL_URL:url},timeout:25000})))
    const events=outputs.flatMap(o=>o.stdout.split('\n').filter(l=>l.startsWith('IGDB_EVENT ')).map(l=>JSON.parse(l.slice(11)) as {kind:string;at:number}))
        .sort((x,y)=>x.at-y.at||(x.kind==='end'?-1:1))
    const starts=events.filter(e=>e.kind==='start').map(e=>e.at)
    expect(starts).toHaveLength(8)
    for(const start of starts) expect(starts.filter(t=>t>=start&&t<start+1000).length).toBeLessThanOrEqual(4)
    let active=0,maximum=0
    for(const event of events){active+=event.kind==='start'?1:-1;maximum=Math.max(maximum,active)}
    expect(active).toBe(0);expect(maximum).toBeLessThanOrEqual(4)
})

it('clears leases and the spacing clock left by an abandoned seed', async () => {
    const id = makeKey()
    expect(await acquire(a, id)).toEqual(expect.any(String))
    const report = await clearIgdbBudget(a)
    expect(report.deletedLeases).toBeGreaterThanOrEqual(1)
    expect(report.budgetsReset).toBeGreaterThanOrEqual(1)
    expect(await a`select count(*)::int as n from igdb_private.request_leases`).toEqual([{ n: 0 }])
    const [clock] = await a`select next_start_at = '-infinity'::timestamptz as reset from igdb_private.request_budgets where credential_key = ${id}`
    expect(clock.reset).toBe(true)
})
