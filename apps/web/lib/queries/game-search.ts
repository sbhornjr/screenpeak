// Split out of lib/queries/game.ts: these three are the only game.ts functions
// still called directly from 'use client' components (SearchableDropdown.tsx,
// FavoriteGamePicker.tsx, AddToListFromListButton.tsx) with the browser Supabase
// client. Keeping them in a file with zero import of '@/lib/db' matters — that
// module constructs a Node-only `postgres` client at module scope, and a bundler
// pulls in a whole module's top-level imports even when a consumer only uses one
// of its exports. Mixing these into game.ts (which does `import { db } from
// '@/lib/db'`) broke every page that renders one of those client components,
// since the bundler tried to include the Postgres driver (and its 'fs'/'net'/etc.
// Node built-ins) in the browser bundle.
import type { SupabaseClient } from '@supabase/supabase-js'
import { Game } from '@screenpeak/shared/types'

export async function searchGamesByName(supabase: SupabaseClient, query: string, limit = 20): Promise<Game[]> {
    const { data } = await supabase
        .from('games')
        .select('id, name, slug, cover_image_url, metacritic_score, released')
        .ilike('name', `%${query}%`)
        .limit(limit)

    return data ?? []
}

type TaxonomyTable = 'developers' | 'publishers'

export async function searchTaxonomyTable(supabase: SupabaseClient, table: TaxonomyTable, query: string, limitToIds?: string[]) {
    let q = supabase
        .from(table)
        .select('id, name, slug')
        .ilike('name', `%${query}%`)
        .order('name')
        .limit(20)

    if (limitToIds && limitToIds.length > 0) {
        q = q.in('id', limitToIds)
    }

    const { data } = await q
    return data ?? []
}

export async function getTaxonomyNameBySlug(supabase: SupabaseClient, table: TaxonomyTable, slug: string) {
    const { data } = await supabase
        .from(table)
        .select('name')
        .eq('slug', slug)
        .single()

    return data?.name ?? ''
}
