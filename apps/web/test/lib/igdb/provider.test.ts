import { expect, it, vi } from 'vitest'
import { createIgdbProvider } from '@/lib/igdb/provider'
const tables: Record<string, unknown[]> = {
    external_game_sources: [{id:27,name:'Steam'}], game_types: [{id:0,type:'Main Game'},{id:8,type:'Remake'}],
    age_rating_organizations: [{id:42,name:'ESRB'}],age_rating_categories:[{id:11,organization:42,rating:'M'}], website_types:[{id:7,type:'Subreddit'}],
}
function setup(extra: (endpoint:string,body:string)=>unknown[] = ()=>[]) {
    const request=vi.fn(async(endpoint:string,body:string,schema:{parse(v:unknown):unknown})=>schema.parse(tables[endpoint]??extra(endpoint,body)))
    return { request, provider:createIgdbProvider({request:request as never}) }
}
it('resolves lookup identifiers from current tables and shares lookup loading',async()=>{
    const s=setup();const [a,b]=await Promise.all([s.provider.getLookups(),s.provider.getLookups()])
    expect(a).toBe(b);expect(a).toMatchObject({steamSourceId:27,mainGameTypeId:0,esrbOrganizationId:42})
    expect(s.request).toHaveBeenCalledTimes(5)
})
it('constructs validated ID queries, distinguishes missing IDs and does not filter Steam editions',async()=>{
    const s=setup(endpoint=>endpoint==='games'?[{id:8,name:'Remake',slug:'remake',game_type:8}]:[])
    expect((await s.provider.getGamesByIds([8])).map(g=>g.igdbId)).toEqual([8])
    expect(s.request.mock.calls.find(c=>c[0]==='games')![1]).not.toContain('game_type =')
    await expect(s.provider.getGamesByIds([NaN])).rejects.toThrow('IDs')
    await expect(s.provider.getGamesByIds([8,9])).rejects.toThrow('missing')
})
it('enforces type zero for explicit main-game hydration',async()=>{
    const s=setup(()=>[{id:8,name:'Remake',slug:'remake',game_type:8}])
    await expect(s.provider.getGamesByIds([8],{mainOnly:true})).rejects.toThrow('main-game')
})
it('paginates mappings and deduplicates candidates instead of choosing the first',async()=>{
    const s=setup((endpoint,body)=> endpoint==='external_games' ? body.includes('offset 0;')
        ? Array.from({length:500},(_,i)=>({id:i+1,uid:'123',game:i===499?2:1,external_game_source:27})) : [] : [])
    const result=await s.provider.lookupSteamApps([123,456])
    expect(result).toEqual([{appid:123,candidates:[1,2]},{appid:456,candidates:[]}])
    expect(s.request.mock.calls.filter(c=>c[0]==='external_games')).toHaveLength(2)
    expect(s.request.mock.calls.find(c=>c[0]==='external_games')![1]).toContain('external_game_source = 27')
})
it('escapes search strings and bounds input before the network',async()=>{
    const s=setup();await s.provider.searchGames('x"; where id > 0;')
    expect(s.request.mock.calls.find(c=>c[0]==='games')![1]).toContain('search "x\\"; where id > 0;";')
    await expect(s.provider.searchGames('x'.repeat(201))).rejects.toThrow('search')
})
type RankRow = { id: number; rating: number; rating_count: number }
function matches(body: string, row: RankRow): boolean {
    const where = body.split(' where ')[1]?.split(';')[0] ?? ''
    return where.split('&').every(raw => {
        const clause = raw.trim()
        if (clause.startsWith('game_type ') || clause === 'rating != null' || clause === 'rating_count != null') return true
        const countLt = /^rating_count < (-?\d+(?:\.\d+)?)$/.exec(clause)
        if (countLt) return row.rating_count < Number(countLt[1])
        const countEq = /^rating_count = (-?\d+(?:\.\d+)?)$/.exec(clause)
        if (countEq) return row.rating_count === Number(countEq[1])
        const ratingLt = /^rating < (-?\d+(?:\.\d+)?)$/.exec(clause)
        if (ratingLt) return row.rating < Number(ratingLt[1])
        const ratingEq = /^rating = (-?\d+(?:\.\d+)?)$/.exec(clause)
        if (ratingEq) return row.rating === Number(ratingEq[1])
        const idGt = /^id > (\d+)$/.exec(clause)
        if (idGt) return row.id > Number(idGt[1])
        throw new Error('unparsed clause: ' + clause)
    })
}
function catalogue(rows: RankRow[], capAt?: number) {
    return (endpoint: string, body: string) => {
        if (endpoint !== 'games') return []
        const limit = Number(/limit (\d+)/.exec(body)?.[1] ?? '0')
        const sort = /sort (id|rating|rating_count) (asc|desc)/.exec(body)
        if (!sort) throw new Error('missing sort')
        const field = sort[1] as keyof RankRow
        const direction = sort[2] === 'asc' ? 1 : -1
        const matched = rows.filter(row => matches(body, row)).sort((a, b) => (a[field] - b[field]) * direction || a.id - b.id)
        return matched.slice(0, capAt ? Math.min(limit, capAt) : limit)
    }
}
it('ranks main games by rating count, then rating, and pages through a cutoff tie', async () => {
    await expect(setup().provider.listTopMainGameIds(0)).rejects.toThrow('limit')
    const ranked = setup(catalogue([
        { id: 1, rating: 10, rating_count: 5 },
        { id: 2, rating: 99, rating_count: 4 },
        { id: 3, rating: 50, rating_count: 5 },
    ]))
    expect(await ranked.provider.listTopMainGameIds(2)).toEqual([3, 1])
    expect(ranked.request.mock.calls.find(call => call[0] === 'games')![1]).toContain('game_type = 0')
    expect(ranked.request.mock.calls.find(call => call[0] === 'games')![1]).toContain('sort rating_count desc')
    const tied = setup(catalogue([
        ...Array.from({ length: 500 }, (_, index) => ({ id: index + 1, rating: 70, rating_count: 100 })),
        { id: 9000, rating: 99, rating_count: 100 },
    ]))
    expect(await tied.provider.listTopMainGameIds(1)).toEqual([9000])
    const bodies = tied.request.mock.calls.filter(call => call[0] === 'games').map(call => call[1] as string)
    expect(bodies.some(body => body.includes('offset'))).toBe(false)
    const sameRating = setup(catalogue([
        { id: 3, rating: 50, rating_count: 10 },
        { id: 1, rating: 50, rating_count: 10 },
        { id: 2, rating: 50, rating_count: 10 },
    ], 2))
    expect(await sameRating.provider.listTopMainGameIds(2)).toEqual([1, 2])
})
it('keeps paging when a response is shorter than the requested page and more games exist', async () => {
    const rows = Array.from({ length: 2500 }, (_, index) => ({ id: index + 1, rating: 80, rating_count: 5000 - index }))
    const s = setup(catalogue(rows, 200))
    const ids = await s.provider.listTopMainGameIds(2000)
    expect(ids).toEqual(Array.from({ length: 2000 }, (_, index) => index + 1))
    const bodies = s.request.mock.calls.filter(call => call[0] === 'games').map(call => call[1] as string)
    expect(bodies.length).toBeGreaterThan(1)
    expect(bodies.some(body => body.includes('offset'))).toBe(false)
    expect(bodies.some(body => body.includes('limit 500'))).toBe(true)
    const small = setup(catalogue(rows.slice(0, 30)))
    expect(await small.provider.listTopMainGameIds(100)).toHaveLength(30)
})
it('rejects unrelated mapping rows and lookup changes instead of reporting misses',async()=>{
    const s=setup(()=>[{id:1,uid:'999',game:1,external_game_source:27}])
    await expect(s.provider.lookupSteamApps([123])).rejects.toThrow('unexpected')
})
