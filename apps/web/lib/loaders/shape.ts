import 'server-only'
import { displayCoverUrl, displayLandscapeUrl } from '@screenpeak/shared/images'
import type { GameCardData } from '@screenpeak/shared/api/games'

export function num(value: unknown): number | null {
    if (value == null || value === '') return null
    const n = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(n) ? n : null
}

export function int(value: unknown, fallback = 0): number {
    const n = num(value)
    return n == null ? fallback : Math.trunc(n)
}

export function text(value: unknown): string | null {
    if (value == null) return null
    return typeof value === 'string' ? value : String(value)
}

export function cover(value: unknown, size: 'large' | 'small'): string | null {
    return typeof value === 'string' ? displayCoverUrl(value, size) : null
}

export function covers(value: unknown, size: 'large' | 'small'): string[] | null {
    if (value == null) return null
    if (!Array.isArray(value)) return []
    return value.flatMap(item => {
        const url = cover(item, size)
        return url ? [url] : []
    })
}

export function landscapes(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value.flatMap(item => {
        const url = typeof item === 'string' ? displayLandscapeUrl(item) : null
        return url ? [url] : []
    })
}

type CardSource = {
    id: unknown
    name: unknown
    slug: unknown
    cover_image_url?: unknown
    released?: unknown
    avg_rating?: unknown
    avg_ngplus_rating?: unknown
    user_rating?: unknown
}

/** A catalogue row, field by field. Drops anything the query added on the side. */
export function gameCard(row: CardSource, developer: string | null, size: 'large' | 'small' = 'large'): GameCardData {
    return {
        id: String(row.id),
        name: String(row.name ?? ''),
        slug: String(row.slug ?? ''),
        cover_image_url: cover(row.cover_image_url, size),
        released: text(row.released),
        developer,
        avg_rating: num(row.avg_rating ?? row.avg_ngplus_rating),
        user_rating: num(row.user_rating),
    }
}
