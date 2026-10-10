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
it('ranks main games by rating count, then rating, and pages through a cutoff tie', async () => {
    const first = Array.from({ length: 500 }, (_, index) => ({ id: index + 1, rating: 70, rating_count: 100 }))
    let gamesCalls = 0
    const s = setup(endpoint => {
        if (endpoint !== 'games') return []
        gamesCalls += 1
        return gamesCalls === 1 ? first : [{ id: 9000, rating: 99, rating_count: 100 }]
    })
    await expect(s.provider.listTopMainGameIds(0)).rejects.toThrow('limit')
    const ranked = setup(() => [
        { id: 1, rating: 10, rating_count: 5 },
        { id: 2, rating: 99, rating_count: 4 },
        { id: 3, rating: 50, rating_count: 5 },
    ])
    expect(await ranked.provider.listTopMainGameIds(2)).toEqual([3, 1])
    expect(ranked.request.mock.calls.find(call => call[0] === 'games')![1]).toContain('game_type = 0')
    expect(ranked.request.mock.calls.find(call => call[0] === 'games')![1]).toContain('sort rating_count desc')
    expect(await s.provider.listTopMainGameIds(1)).toEqual([9000])
    const bodies = s.request.mock.calls.filter(call => call[0] === 'games').map(call => call[1] as string)
    expect(bodies.some(body => body.includes('offset 500'))).toBe(true)
})
it('rejects unrelated mapping rows and lookup changes instead of reporting misses',async()=>{
    const s=setup(()=>[{id:1,uid:'999',game:1,external_game_source:27}])
    await expect(s.provider.lookupSteamApps([123])).rejects.toThrow('unexpected')
})
