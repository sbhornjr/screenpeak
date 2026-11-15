import 'server-only'
import type { GameSearchHit, ListSearchHit, TaxonomySearchHit, UserSearchHit } from '@screenpeak/shared/api/search'
import { cover, int, num, text } from '@/lib/loaders/shape'
import type { UserNameHit } from '@/lib/queries/user'
import type { ListSearchRow } from '@/lib/queries/list'

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

/** User search row, field by field. `avatar_url` passes through unrewritten (already display-ready). */
export function toUserSearchHit(row: UserNameHit): UserSearchHit {
    return {
        id: String(row.id),
        username: String(row.username ?? ''),
        avatar_url: row.avatar_url ?? null,
        follower_count: int(row.follower_count),
    }
}

/** List search row, field by field. Covers use the 'small' size, matching `lists-page.ts`. */
export function toListSearchHit(row: ListSearchRow): ListSearchHit {
    return {
        id: String(row.id),
        name: String(row.name ?? ''),
        description: text(row.description) ?? '',
        owner_username: String(row.owner_username ?? ''),
        last_activity: text(row.last_activity) ?? '',
        game_count: int(row.game_count),
        like_count: int(row.like_count),
        viewer_has_liked: !!row.viewer_has_liked,
        covers: row.covers.map(item => ({
            cover_image_url: cover(item.cover_image_url, 'small'),
            slug: item.slug,
        })),
    }
}
