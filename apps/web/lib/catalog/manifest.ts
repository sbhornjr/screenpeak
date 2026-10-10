import { createHash } from 'node:crypto'
import type { CatalogGame, CatalogTaxon } from './types'

function taxa(values: CatalogTaxon[]) {
    return [...values].sort((a, b) => a.igdbId - b.igdbId).map(taxon => ({
        igdbId: taxon.igdbId, name: taxon.name, slug: taxon.slug, providerUpdatedAt: taxon.providerUpdatedAt ?? null,
    }))
}

export type ResetCounts = {
    library: number; reviews: number; memberships: number; favourites: number
    users: number; lists: number; follows: number; likes: number; steam: number; games: number
}

export type CatalogResetManifest = {
    runId: string
    fingerprint: string
    counts: ResetCounts
    games: CatalogGame[]
}

export function manifestChecksum(fingerprint: string, games: CatalogGame[], counts: ResetCounts): string {
    const canonical = {
        fingerprint,
        counts,
        games: [...games].sort((a, b) => a.igdbId - b.igdbId).map(game => ({
            ...game,
            steamAppIds: [...game.steamAppIds].sort((a, b) => a - b),
            genres: taxa(game.genres), platforms: taxa(game.platforms),
            developers: taxa(game.developers), publishers: taxa(game.publishers),
        })),
    }
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}
