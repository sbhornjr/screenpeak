'use server'

import { headers } from 'next/headers'
import { searchGamesByName as queryGamesByName, searchTaxonomyTable as queryTaxonomy, searchLibraryTaxonomy as queryLibraryTaxonomy, getTaxonomyNameBySlug as queryTaxonomyName, SearchInputError } from '@/lib/queries/game'
import { gameSearchSchema, taxonomySearchSchema, taxonomySlugSchema, taxonomyTableSchema } from '@screenpeak/shared/schemas'
import type { TaxonomySearchTable } from '@screenpeak/shared/api/search'
import { getOptionalUser } from '@/lib/auth'
import { consumeSearchRateLimit } from '@/lib/rate-limit'
import { toGameSearchHit, toTaxonomyHit } from '@/lib/search-shape'

// Public catalogue. The same queries back GET /api/v1/games/search and
// GET /api/v1/taxonomy/[table]/search. A bad string returns nothing; a
// database error rejects so the caller can tell an outage from no matches.
// An id list over the cap throws — it is not "no matches". A parsed search
// spends the same budget as the GET routes, keyed search:user:<uuid> when
// the cookie session is signed in.

export async function searchGamesByName(query: string) {
    const parsed = gameSearchSchema.safeParse({ q: query })
    if (!parsed.success) return []
    const user = await getOptionalUser()
    await consumeSearchRateLimit(user?.id ?? null, await headers())
    const rows = await queryGamesByName(parsed.data.q, parsed.data.limit)
    return rows.map(toGameSearchHit)
}

export async function searchTaxonomyTable(table: TaxonomySearchTable, query: string, limitToIds?: string[]) {
    const parsed = taxonomySearchSchema.safeParse({ table, q: query, ids: limitToIds })
    if (!parsed.success) {
        const idsIssue = parsed.error.issues.find(issue => issue.path[0] === 'ids')
        if (idsIssue) throw new SearchInputError(idsIssue.message)
        return []
    }
    const user = await getOptionalUser()
    await consumeSearchRateLimit(user?.id ?? null, await headers())
    const rows = await queryTaxonomy(parsed.data.table, parsed.data.q, parsed.data.ids, parsed.data.limit)
    return rows.map(toTaxonomyHit)
}

/** Developers or publishers on the signed-in user's library. No client id list. */
export async function searchLibraryTaxonomy(table: TaxonomySearchTable, query: string) {
    const parsed = taxonomySearchSchema.safeParse({ table, q: query })
    if (!parsed.success) return []
    const user = await getOptionalUser()
    if (!user) return []
    await consumeSearchRateLimit(user.id, await headers())
    const rows = await queryLibraryTaxonomy(user.id, parsed.data.table, parsed.data.q, parsed.data.limit)
    return rows.map(toTaxonomyHit)
}

export async function getTaxonomyNameBySlug(table: TaxonomySearchTable, slug: string) {
    const parsedTable = taxonomyTableSchema.safeParse(table)
    const parsedSlug = taxonomySlugSchema.safeParse(slug)
    if (!parsedTable.success || !parsedSlug.success) return ''
    return queryTaxonomyName(parsedTable.data, parsedSlug.data)
}
