import type { NextRequest } from 'next/server'
import type { TaxonomySearchPage } from '@screenpeak/shared/api/search'
import { ApiError, withAuth } from '@/lib/api'
import { getBearerUser } from '@/lib/auth'
import { searchTaxonomyTable } from '@/lib/queries/game'
import { consumeSearchRateLimit } from '@/lib/rate-limit'
import { parseTaxonomySearchQuery } from '@/lib/screen-query'
import { toTaxonomyHit } from '@/lib/search-shape'

const PRIVATE = { headers: { 'Cache-Control': 'private, no-store' } }

// Developer and publisher typeahead. Works signed out. `genres` is 400.
export const GET = withAuth(async (req: NextRequest, ctx: RouteContext<'/api/v1/taxonomy/[table]/search'>) => {
    const user = await getBearerUser()
    const { table } = await ctx.params
    const parsed = parseTaxonomySearchQuery(table, req.nextUrl.searchParams)
    if (!parsed.ok) throw new ApiError(400, 'invalid_request', parsed.message)
    await consumeSearchRateLimit(user?.id ?? null, req.headers)

    const rows = await searchTaxonomyTable(parsed.query.table, parsed.query.q, parsed.query.ids, parsed.query.limit)
    const data: TaxonomySearchPage = { results: rows.map(toTaxonomyHit) }
    return Response.json(data satisfies TaxonomySearchPage, PRIVATE)
})
