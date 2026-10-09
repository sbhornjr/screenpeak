import 'server-only'

export type CatalogTaxon = { igdbId: number; name: string; slug: string }
export type CatalogGame = {
    igdbId: number
    name: string
    providerSlug: string
    gameType: number | null
    released: string | null
    description: string | null
    coverImageUrl: string | null
    artworkImageUrl: string | null
    screenshots: string[]
    esrbRating: string | null
    redditUrl: string | null
    providerUpdatedAt: string | null
    genres: CatalogTaxon[]
    platforms: CatalogTaxon[]
    developers: CatalogTaxon[]
    publishers: CatalogTaxon[]
    steamAppIds: number[]
}
