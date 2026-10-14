import 'server-only'
import { z } from 'zod'
export const positiveId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
export const lookupId = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const seconds = z.number().int().nonnegative().max(253402300799)
const taxon = z.object({ id: positiveId, name: z.string().min(1), slug: z.string().min(1).optional(), updated_at: seconds.optional() })
export const imageSchema = z.object({ url: z.string().optional(), image_id: z.string().optional(), width: z.number().positive().optional(), height: z.number().positive().optional() })
export const gameSchema = z.object({
    id: positiveId, name: z.string().min(1), slug: z.string().min(1), game_type: lookupId.optional(),
    summary: z.string().optional(), first_release_date: z.number().int().min(-62135596800).max(253402300799).optional(), updated_at: seconds.optional(),
    genres: z.array(taxon).optional(), platforms: z.array(taxon).optional(),
    involved_companies: z.array(z.object({ developer: z.boolean().optional(), publisher: z.boolean().optional(), company: taxon.optional() })).optional(),
    cover: imageSchema.optional(), screenshots: z.array(imageSchema).optional(), artworks: z.array(imageSchema).optional(),
    age_ratings: z.array(z.object({ organization: positiveId.optional(), rating_category: positiveId.optional() })).optional(),
    websites: z.array(z.object({ type: positiveId.optional(), url: z.string().optional() })).optional(),
    external_games: z.array(z.object({ uid: z.string().optional(), external_game_source: positiveId.optional() })).optional(),
})
export type IgdbGame = z.infer<typeof gameSchema>
export type IgdbLookups = {
    steamSourceId: number; mainGameTypeId: number; esrbOrganizationId: number; redditWebsiteTypeId: number
    gameTypes: Map<number, string>
    ageCategories: Map<number, { organization: number; rating: string }>
}
export const GAME_FIELDS = 'id,name,slug,game_type,summary,first_release_date,updated_at,genres.id,genres.name,genres.slug,genres.updated_at,platforms.id,platforms.name,platforms.slug,platforms.updated_at,involved_companies.developer,involved_companies.publisher,involved_companies.company.id,involved_companies.company.name,involved_companies.company.slug,involved_companies.company.updated_at,cover.url,cover.image_id,screenshots.url,screenshots.image_id,artworks.url,artworks.image_id,artworks.width,artworks.height,age_ratings.organization,age_ratings.rating_category,websites.type,websites.url,external_games.uid,external_games.external_game_source'
