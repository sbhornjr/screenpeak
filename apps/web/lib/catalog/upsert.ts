import 'server-only'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { and, eq, sql } from 'drizzle-orm'
import { db, type DB } from '@/lib/db'
import { games, gameExternalIds } from '@/db/schema'
import { parseDbTimestamp } from '@screenpeak/shared/dates'
import type { CatalogGame, CatalogTaxon } from './types'

const positiveId = z.number().int().positive().max(2_147_483_647)
const httpsUrl = z.string().url().refine(value => {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
})
const imageUrl = httpsUrl.refine(value => new URL(value).hostname === 'images.igdb.com')
const taxonSchema = z.object({ igdbId: positiveId, name: z.string().trim().min(1), slug: z.string().min(1), providerUpdatedAt: z.string().datetime().nullable().optional() }).strict()
const taxaSchema = z.array(taxonSchema).refine(values => new Set(values.map(t => t.igdbId)).size === values.length, 'Duplicate taxonomy IDs')
// Required nullable fields describe authoritative absence; omitted fields do not.
export const catalogGameSchema = z.object({
    igdbId: positiveId, name: z.string().trim().min(1), providerSlug: z.string().min(1),
    gameType: z.number().int().nonnegative().nullable(), released: z.string().date().nullable(),
    description: z.string().nullable(), coverImageUrl: imageUrl.nullable(), artworkImageUrl: imageUrl.nullable(),
    screenshots: z.array(imageUrl), esrbRating: z.string().nullable(), redditUrl: httpsUrl.nullable(),
    providerUpdatedAt: z.string().datetime().nullable(), genres: taxaSchema, platforms: taxaSchema,
    developers: taxaSchema, publishers: taxaSchema, steamAppIds: z.array(positiveId),
}).strict()

/** Static path segments under `app/games/`, beside `[slug]`. Add the next one here. */
export const RESERVED_GAME_SLUGS = ['search'] as const

/** A reserved or already-used base becomes `base-id`, so `search` is never stored. */
export function storedGameSlug(baseSlug: string, id: string, slugTaken: boolean): string {
    if (slugTaken || (RESERVED_GAME_SLUGS as readonly string[]).includes(baseSlug)) return `${baseSlug}-${id}`
    return baseSlug
}

export function catalogSlug(providerSlug: string): string {
    // No provider-id suffix. A games.slug conflict appends the local games.id instead.
    return providerSlug.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 160).replace(/-$/, '') || 'game'
}

export function taxonCandidates(preferred: string, igdbId: number): string[] {
    return [preferred, `igdb-${igdbId}`, `${preferred}-igdb-${igdbId}`]
}
export function taxonIsNewer(stored: string | null, incoming: string | null): boolean {
    if (!incoming) return false
    if (!stored) return true
    return parseDbTimestamp(incoming).getTime() > parseDbTimestamp(stored).getTime()
}

type CatalogTransaction = Parameters<Parameters<DB['transaction']>[0]>[0]
const relations = [
    { key: 'genres', table: 'genres', join: 'game_genres', fk: 'genre_id' },
    { key: 'platforms', table: 'platforms', join: 'game_platforms', fk: 'platform_id' },
    { key: 'developers', table: 'developers', join: 'game_developers', fk: 'developer_id' },
    { key: 'publishers', table: 'publishers', join: 'game_publishers', fk: 'publisher_id' },
] as const
const identifier = (name: string) => sql.identifier(name)
const sortedTaxa = (values: CatalogTaxon[]) => [...values].sort((a, b) => a.igdbId - b.igdbId)
const taxonContent = (values: CatalogTaxon[]) => sortedTaxa(values).map(({ igdbId, name, slug }) => ({ igdbId, name, slug }))
export function catalogContent(game: CatalogGame): string {
    // Source timestamp and relation order are not display-content changes.
    return JSON.stringify({ igdbId: game.igdbId, name: game.name, providerSlug: game.providerSlug,
        gameType: game.gameType, released: game.released, description: game.description,
        coverImageUrl: game.coverImageUrl, artworkImageUrl: game.artworkImageUrl,
        screenshots: game.screenshots, esrbRating: game.esrbRating, redditUrl: game.redditUrl,
        genres: taxonContent(game.genres), platforms: taxonContent(game.platforms),
        developers: taxonContent(game.developers), publishers: taxonContent(game.publishers),
        steamAppIds: [...new Set(game.steamAppIds)].sort((a, b) => a - b) })
}

/**
 * Only for trusted server ingestion/reset code. Never expose as a Server Action.
 * Seed and reset pass the full Steam id set and replace mappings. Steam import
 * passes the ids it actually accepted and must not delete the game's other rows.
 */
export async function writeCatalogGame(
    tx: CatalogTransaction,
    input: CatalogGame,
    options: { retainUnlistedSteamIds?: boolean } = {},
): Promise<{ id: string; slug: string }> {
    const game = catalogGameSchema.parse(input)
    // Per-provider identity lock spans every related write, including first insert.
    // Different games can proceed concurrently; shared taxa are acquired in ID order.
    await tx.execute(sql`select pg_advisory_xact_lock(1936745319, ${game.igdbId})`)
    const [existing] = await tx.select({ id: games.id, slug: games.slug, igdbId: games.igdbId,
        name: games.name, providerSlug: games.providerSlug, gameType: games.gameType, released: games.released,
        description: games.description, coverImageUrl: games.coverImageUrl, artworkImageUrl: games.artworkImageUrl,
        screenshots: games.screenshots, esrbRating: games.esrbRating, redditUrl: games.redditUrl,
        providerUpdatedAt: games.providerUpdatedAt,
    }).from(games).where(eq(games.igdbId, game.igdbId))
    if (existing?.providerUpdatedAt && (!game.providerUpdatedAt ||
        parseDbTimestamp(existing.providerUpdatedAt).getTime() > parseDbTimestamp(game.providerUpdatedAt).getTime())) {
        return { id: existing.id, slug: existing.slug }
    }
    let previousContent: string | null = null
    if (existing) {
        const oldTaxa: Record<string, CatalogTaxon[]> = {}
        for (const relation of relations) {
            const rows = await tx.execute(sql`select t.igdb_id as "igdbId", t.name, t.slug
                from public.${identifier(relation.table)} t
                join public.${identifier(relation.join)} j on j.${identifier(relation.fk)}=t.id
                where j.game_id=${existing.id}::uuid order by t.igdb_id`)
            oldTaxa[relation.key] = rows as unknown as CatalogTaxon[]
        }
        const mappings = await tx.select({ externalId: gameExternalIds.externalId }).from(gameExternalIds)
            .where(and(eq(gameExternalIds.gameId, existing.id), eq(gameExternalIds.provider, 'steam')))
        previousContent = catalogContent({ ...existing, igdbId: game.igdbId, providerSlug: existing.providerSlug ?? '',
            screenshots: existing.screenshots ?? [], genres: oldTaxa.genres, platforms: oldTaxa.platforms,
            developers: oldTaxa.developers, publishers: oldTaxa.publishers,
            steamAppIds: mappings.map(m => Number(m.externalId)) })
    }
    const id = existing?.id ?? randomUUID()
    const baseSlug = catalogSlug(game.providerSlug)
    // Preserve a published local slug when IGDB changes its provider slug.
    let localSlug = existing?.slug ?? baseSlug
    if (!existing) {
        await tx.execute(sql`select pg_advisory_xact_lock(1936745320, hashtext(${baseSlug}))`)
        const taken = await tx.execute(sql`select 1 as one from public.games where slug = ${baseSlug} limit 1`)
        localSlug = storedGameSlug(baseSlug, id, taken.length > 0)
    }
    const now = new Date().toISOString()
    const columns = [
        ['igdb_id', game.igdbId], ['name', game.name], ['provider_slug', game.providerSlug],
        ['game_type', game.gameType], ['released', game.released], ['description', game.description],
        ['cover_image_url', game.coverImageUrl], ['artwork_image_url', game.artworkImageUrl],
        ['screenshots', sql`ARRAY[${sql.join(game.screenshots.map(url => sql`${url}`), sql`, `)}]::text[]`],
        ['esrb_rating', game.esrbRating], ['reddit_url', game.redditUrl],
        ['provider_updated_at', game.providerUpdatedAt], ['metadata_synced_at', now],
    ] as const
    // Explicit columns work before AND after cleanup. Drizzle's table insert
    // builder includes every declared column, even omitted legacy defaults.
    // id and slug are insert-only so a conflict update cannot rename a published URL.
    const result = await tx.execute(sql`insert into public.games
        (id, ${sql.join(columns.map(([name]) => identifier(name)), sql`, `)}, slug)
        values (${id}::uuid, ${sql.join(columns.map(([, value]) => sql`${value}`), sql`, `)}, ${localSlug})
        on conflict (igdb_id) do update set
        ${sql.join(columns.map(([name]) => sql`${identifier(name)}=excluded.${identifier(name)}`), sql`, `)}
        returning id,slug`)
    const row = result[0] as { id: string; slug: string }
    const effectiveTaxa: Record<string, CatalogTaxon[]> = {}
    for (const relation of relations) {
        effectiveTaxa[relation.key] = []
        const ids: string[] = []
        // One lock per taxonomy table, always in this relation order, so slug
        // assignment cannot deadlock with another game's taxonomy writes.
        await tx.execute(sql`select pg_advisory_xact_lock(1936745322, hashtext(${relation.table}))`)
        for (const taxon of sortedTaxa(game[relation.key])) {
            const table = identifier(relation.table)
            const candidates = taxonCandidates(taxon.slug, taxon.igdbId)
            const known = await tx.execute(sql`select igdb_id as "igdbId", slug, provider_updated_at as "providerUpdatedAt"
                from public.${table} where igdb_id = ${taxon.igdbId} or slug in (${sql.join(candidates.map(slug => sql`${slug}`), sql`, `)})`)
            const rows = known as unknown as { igdbId: number; slug: string; providerUpdatedAt: string | null }[]
            const mine = rows.find(row => Number(row.igdbId) === taxon.igdbId)
            const taken = new Set(rows.filter(row => Number(row.igdbId) !== taxon.igdbId).map(row => row.slug))
            const slug = mine && !taxonIsNewer(mine.providerUpdatedAt, taxon.providerUpdatedAt ?? null)
                ? mine.slug
                : candidates.find(candidate => candidate === mine?.slug || !taken.has(candidate))
            if (!slug) throw new Error('No free taxonomy slug')
            const result = await tx.execute(sql`insert into public.${table} as current_taxon (igdb_id,name,slug,provider_updated_at)
                values (${taxon.igdbId},${taxon.name},${slug},${taxon.providerUpdatedAt ?? null}::timestamptz)
                on conflict (igdb_id) do update set name=excluded.name,slug=excluded.slug,
                    provider_updated_at=excluded.provider_updated_at
                where excluded.provider_updated_at is not null and
                    (current_taxon.provider_updated_at is null or excluded.provider_updated_at > current_taxon.provider_updated_at)
                returning id,name,slug`)
            // A missing/equal/older source timestamp preserves the known taxon.
            // Read the winner when the conditional update returned no row.
            const saved = result[0] ?? (await tx.execute(sql`select id,name,slug from public.${table} where igdb_id=${taxon.igdbId}`))[0]
            ids.push(saved.id as string)
            effectiveTaxa[relation.key].push({ igdbId: taxon.igdbId, name: saved.name as string, slug: saved.slug as string })
        }
        await tx.execute(sql`delete from public.${identifier(relation.join)} where game_id=${row.id}::uuid`)
        for (const id of ids) await tx.execute(sql`insert into public.${identifier(relation.join)} (game_id,${identifier(relation.fk)}) values (${row.id}::uuid,${id}::uuid)`)
    }
    const steamIds = [...new Set(game.steamAppIds)].sort((a, b) => a - b)
    // A complete authoritative payload replaces mappings too, but never steals one.
    for (const appId of steamIds) {
        await tx.insert(gameExternalIds).values({ provider: 'steam', externalId: String(appId), gameId: row.id,
            matchMethod: 'igdb_external_id', verifiedAt: now }).onConflictDoNothing()
        const [mapping] = await tx.select({ gameId: gameExternalIds.gameId }).from(gameExternalIds)
            .where(and(eq(gameExternalIds.provider, 'steam'), eq(gameExternalIds.externalId, String(appId))))
        if (mapping?.gameId !== row.id) throw new Error('Steam external ID is already associated with another catalogue game')
        await tx.update(gameExternalIds).set({ verifiedAt: now }).where(and(eq(gameExternalIds.provider, 'steam'), eq(gameExternalIds.externalId, String(appId))))
    }
    if (!options.retainUnlistedSteamIds) {
        await tx.execute(steamIds.length
            ? sql`delete from public.game_external_ids where game_id=${row.id}::uuid and provider='steam' and external_id not in (${sql.join(steamIds.map(id => sql`${String(id)}`), sql`, `)})`
            : sql`delete from public.game_external_ids where game_id=${row.id}::uuid and provider='steam'`)
    }
    if (previousContent !== catalogContent({ ...game, genres: effectiveTaxa.genres, platforms: effectiveTaxa.platforms,
        developers: effectiveTaxa.developers, publishers: effectiveTaxa.publishers })) {
        await tx.update(games).set({ updatedAt: now }).where(eq(games.id, row.id))
    }
    return row
}

export async function upsertCatalogGame(input: CatalogGame): Promise<{ id: string; slug: string }> {
    const game = catalogGameSchema.parse(input)
    return db.transaction(async tx => {
        await tx.execute(sql`set local lock_timeout = '5s'`)
        await tx.execute(sql`set local statement_timeout = '15s'`)
        return writeCatalogGame(tx, game)
    })
}
