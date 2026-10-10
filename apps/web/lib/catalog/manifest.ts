import { createHash } from 'node:crypto'
import type { CatalogGame, CatalogTaxon } from './types'

function taxa(values: CatalogTaxon[]) {
    return [...values].sort((a, b) => a.igdbId - b.igdbId).map(taxon => ({
        igdbId: taxon.igdbId, name: taxon.name, slug: taxon.slug, providerUpdatedAt: taxon.providerUpdatedAt ?? null,
    }))
}

export type CatalogResetManifest = {
    runId: string
    fingerprint: string
    games: CatalogGame[]
}

export function manifestChecksum(fingerprint: string, games: CatalogGame[]): string {
    const canonical = {
        fingerprint,
        games: [...games].sort((a, b) => a.igdbId - b.igdbId).map(game => ({
            ...game,
            steamAppIds: [...game.steamAppIds].sort((a, b) => a - b),
            genres: taxa(game.genres), platforms: taxa(game.platforms),
            developers: taxa(game.developers), publishers: taxa(game.publishers),
        })),
    }
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}
