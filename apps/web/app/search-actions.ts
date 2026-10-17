'use server'

import { searchGamesByName as queryGamesByName, searchTaxonomyTable as queryTaxonomy, getTaxonomyNameBySlug as queryTaxonomyName } from '@/lib/queries/game'
import { gameSearchSchema, taxonomySearchSchema, taxonomySlugSchema, taxonomyTableSchema } from '@screenpeak/shared/schemas'
import type { TaxonomySearchTable } from '@screenpeak/shared/api/search'
import { toGameSearchHit, toTaxonomyHit } from '@/lib/search-shape'

// Public catalogue. The same queries back GET /api/v1/games/search and
// GET /api/v1/taxonomy/[table]/search. A bad string returns nothing; a
// database error rejects so the caller can tell an outage from no matches.

export async function searchGamesByName(query: string) {
    const parsed = gameSearchSchema.safeParse({ q: query })
    if (!parsed.success) return []
    const rows = await queryGamesByName(parsed.data.q, parsed.data.limit)
    return rows.map(toGameSearchHit)
}

export async function searchTaxonomyTable(table: TaxonomySearchTable, query: string, limitToIds?: string[]) {
    const parsed = taxonomySearchSchema.safeParse({ table, q: query, ids: limitToIds })
    if (!parsed.success) return []
    const rows = await queryTaxonomy(parsed.data.table, parsed.data.q, parsed.data.ids, parsed.data.limit)
    return rows.map(toTaxonomyHit)
}

export async function getTaxonomyNameBySlug(table: TaxonomySearchTable, slug: string) {
    const parsedTable = taxonomyTableSchema.safeParse(table)
    const parsedSlug = taxonomySlugSchema.safeParse(slug)
    if (!parsedTable.success || !parsedSlug.success) return ''
    return queryTaxonomyName(parsedTable.data, parsedSlug.data)
}
