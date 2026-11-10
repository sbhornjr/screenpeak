import 'server-only'
import type { GameSearchHit, TaxonomySearchHit } from '@screenpeak/shared/api/search'
import { cover, num, text } from '@/lib/loaders/shape'

export type GameSearchRow = {
    id: string
    name: string
    slug: string
    cover_image_url: string | null
    released: string | null
    avg_rating: number | null
}

/** Catalogue search row, field by field. Cover is display-ready. */
export function toGameSearchHit(row: GameSearchRow): GameSearchHit {
    return {
        id: String(row.id),
        name: String(row.name ?? ''),
        slug: String(row.slug ?? ''),
        cover_image_url: cover(row.cover_image_url, 'large'),
        released: text(row.released),
        avg_rating: num(row.avg_rating),
    }
}

export function toTaxonomyHit(row: { id: string, name: string, slug: string }): TaxonomySearchHit {
    return { id: String(row.id), name: String(row.name ?? ''), slug: String(row.slug ?? '') }
}
