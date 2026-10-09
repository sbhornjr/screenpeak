import { expect, it } from 'vitest'
import { gameSchema } from '@/lib/igdb/schema'
import { normalizeIgdbGame } from '@/lib/igdb/normalize'
const lookups = { steamSourceId: 27, mainGameTypeId: 0, esrbOrganizationId: 42, redditWebsiteTypeId: 7,
    gameTypes: new Map([[0,'Main Game'],[8,'Remake']]), ageCategories: new Map([[10,{organization:42,rating:'T'}],[11,{organization:42,rating:'M'}],[12,{organization:9,rating:'18'}]]) }
const image=(id:string,width=600,height=400)=>({url:`//images.igdb.com/igdb/image/upload/t_thumb/${id}.jpg`,image_id:id,width,height})
it('keeps absent optional metadata null and has no external scores',()=>{
    const game=normalizeIgdbGame(gameSchema.parse({id:1,name:'Game',slug:'game'}),lookups)
    expect(game).toMatchObject({released:null,coverImageUrl:null,artworkImageUrl:null,esrbRating:null,genres:[],steamAppIds:[]})
    expect(game).not.toHaveProperty('rating');expect(game).not.toHaveProperty('metacriticScore')
})
it('uses UTC seconds, both company roles, expanded taxonomy and verified Steam source',()=>{
    const game=normalizeIgdbGame(gameSchema.parse({id:1,name:'Game',slug:'game',game_type:0,first_release_date:0,updated_at:86400,
        genres:[{id:3,name:'Adventure',slug:'adventure'}],involved_companies:[{developer:true,publisher:true,company:{id:4,name:'Studio',slug:'studio'}}],
        external_games:[{uid:'123',external_game_source:27},{uid:'123',external_game_source:27},{uid:'999',external_game_source:3}],
        age_ratings:[{organization:9,rating_category:12},{organization:42,rating_category:11}],cover:image('cover'),screenshots:[image('screen'),image('screen')],artworks:[image('portrait',400,800),image('landscape')]}),lookups)
    expect(game).toMatchObject({released:'1970-01-01',providerUpdatedAt:'1970-01-02T00:00:00.000Z',steamAppIds:[123],esrbRating:'M'})
    expect(game.developers).toEqual(game.publishers);expect(game.screenshots).toHaveLength(1)
    expect(game.coverImageUrl).toContain('t_cover_big_2x/cover.jpg');expect(game.artworkImageUrl).toContain('landscape.jpg')
})
it('uses a screenshot when artwork is absent; ignores invalid image URLs and mismatched IDs',()=>{
    const game=normalizeIgdbGame(gameSchema.parse({id:1,name:'Game',slug:'game',cover:{url:'https://evil.example/x.jpg'},screenshots:[{...image('one'),image_id:'two'},image('safe')]}),lookups)
    expect(game.coverImageUrl).toBeNull();expect(game.artworkImageUrl).toContain('safe.jpg');expect(game.screenshots).toHaveLength(1)
})
it('does not arbitrarily choose conflicting ESRB ratings or invent unknown lookup values',()=>{
    const make=(age_ratings:object[])=>gameSchema.parse({id:1,name:'Game',slug:'game',age_ratings})
    expect(normalizeIgdbGame(make([{organization:42,rating_category:10},{organization:42,rating_category:11}]),lookups).esrbRating).toBeNull()
    expect(()=>normalizeIgdbGame(make([{organization:42,rating_category:999}]),lookups)).toThrow('lookup')
})
it('accepts historical releases before the Unix epoch',()=>{
    const game=normalizeIgdbGame(gameSchema.parse({id:1,name:'Historical game',slug:'historical-game',first_release_date:-353894400}),lookups)
    expect(game.released).toBe('1958-10-15')
})
