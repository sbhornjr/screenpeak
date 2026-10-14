import { randomUUID } from 'node:crypto'
import { sql, type SQL } from 'drizzle-orm'
import { parseDbTimestamp } from '@/lib/dates'
import { catalogContent, catalogGameSchema, catalogSlug, taxonCandidates, taxonIsNewer } from './upsert'
import type { CatalogGame, CatalogTaxon } from './types'

/**
 * Seed batches used to call the single-game writer once per row. A populated
 * game is about sixty round trips (one select and one insert per genre,
 * platform, company, and Steam id, plus slug and lock checks). At the
 * session-pooler latency that made a 50-game commit take ~10 minutes, that
 * is a few seconds per game. This writer keeps the same slug, freshness, and
 * Steam rules and sends one statement per table for the whole batch.
 */
const RELATIONS = [
    { key: 'genres', table: 'genres', join: 'game_genres', fk: 'genre_id' },
    { key: 'platforms', table: 'platforms', join: 'game_platforms', fk: 'platform_id' },
    { key: 'developers', table: 'developers', join: 'game_developers', fk: 'developer_id' },
    { key: 'publishers', table: 'publishers', join: 'game_publishers', fk: 'publisher_id' },
] as const
type RelationKey = (typeof RELATIONS)[number]['key']
type Executor = { execute: (query: SQL) => Promise<unknown> }

export type StoredGame = {
    id: string
    igdbId: number
    slug: string
    name: string
    providerSlug: string
    gameType: number | null
    released: string | null
    description: string | null
    coverImageUrl: string | null
    artworkImageUrl: string | null
    screenshots: string[]
    esrbRating: string | null
    redditUrl: string | null
    providerUpdatedAt: string | null
    updatedAt: string | null
}

export type PlannedGame = {
    game: CatalogGame
    id: string
    slug: string
    isNew: boolean
    skip: boolean
    changed: boolean
    existingUpdatedAt: string | null
    stored: StoredGame | null
}

export type KnownTaxon = {
    igdbId: number
    id: string
    name: string
    slug: string
    providerUpdatedAt: string | null
}

export type TaxonWrite = {
    igdbId: number
    id: string
    name: string
    slug: string
    providerUpdatedAt: string | null
}

type TaxonSnapshot = { igdbId: number; name: string; slug: string }
type EffectiveTaxon = TaxonSnapshot & { id: string }

/** Same early return as writeCatalogGame: a stored timestamp newer than the payload is left alone. */
export function storedCatalogIsNewer(stored: string | null, incoming: string | null): boolean {
    if (!stored) return false
    if (!incoming) return true
    return parseDbTimestamp(stored).getTime() > parseDbTimestamp(incoming).getTime()
}

export function planGameWrites(games: CatalogGame[], stored: StoredGame[], takenSlugs: Iterable<string>): PlannedGame[] {
    const storedById = new Map(stored.map(row => [row.igdbId, row]))
    const taken = new Set(takenSlugs)
    return games.map(game => {
        const row = storedById.get(game.igdbId)
        if (row && storedCatalogIsNewer(row.providerUpdatedAt, game.providerUpdatedAt)) {
            return { game, id: row.id, slug: row.slug, isNew: false, skip: true, changed: false, existingUpdatedAt: row.updatedAt, stored: row }
        }
        if (row) {
            return { game, id: row.id, slug: row.slug, isNew: false, skip: false, changed: false, existingUpdatedAt: row.updatedAt, stored: row }
        }
        const id = randomUUID()
        const base = catalogSlug(game.providerSlug)
        const slug = taken.has(base) ? `${base}-${id}` : base
        taken.add(slug)
        return { game, id, slug, isNew: true, skip: false, changed: true, existingUpdatedAt: null, stored: null }
    })
}

/**
 * Resolve taxonomy slugs in the same order as per-game writes: batch order,
 * and igdb id order inside a game. An older or equal source timestamp keeps
 * the stored row. The returned writes are the rows that must be inserted or
 * conditionally updated; effective[i] is the taxa game i links to.
 */
export function planTaxonWrites(games: { taxa: CatalogTaxon[] }[], known: KnownTaxon[]): {
    writes: TaxonWrite[]
    effective: EffectiveTaxon[][]
} {
    const byId = new Map<number, KnownTaxon>()
    const slugOwner = new Map<string, number>()
    for (const row of known) {
        byId.set(row.igdbId, row)
        slugOwner.set(row.slug, row.igdbId)
    }
    const writes = new Map<number, TaxonWrite>()
    const effective = games.map(game => [...game.taxa].sort((a, b) => a.igdbId - b.igdbId).map(taxon => {
        const incomingAt = taxon.providerUpdatedAt ?? null
        const mine = byId.get(taxon.igdbId)
        const candidates = taxonCandidates(taxon.slug, taxon.igdbId)
        const taken = new Set(candidates.filter(candidate => {
            const owner = slugOwner.get(candidate)
            return owner != null && owner !== taxon.igdbId
        }))
        const slug = mine && !taxonIsNewer(mine.providerUpdatedAt, incomingAt)
            ? mine.slug
            : candidates.find(candidate => candidate === mine?.slug || !taken.has(candidate))
        if (!slug) throw new Error('No free taxonomy slug')
        if (mine && !taxonIsNewer(mine.providerUpdatedAt, incomingAt)) {
            return { igdbId: taxon.igdbId, id: mine.id, name: mine.name, slug: mine.slug }
        }
        const id = mine?.id ?? writes.get(taxon.igdbId)?.id ?? randomUUID()
        if (mine && mine.slug !== slug && slugOwner.get(mine.slug) === taxon.igdbId) slugOwner.delete(mine.slug)
        slugOwner.set(slug, taxon.igdbId)
        const saved: KnownTaxon = { id, igdbId: taxon.igdbId, name: taxon.name, slug, providerUpdatedAt: incomingAt }
        byId.set(taxon.igdbId, saved)
        writes.set(taxon.igdbId, saved)
        return { igdbId: taxon.igdbId, id, name: taxon.name, slug }
    }))
    return { writes: [...writes.values()], effective }
}

/**
 * Rows whose slug changes have to leave the unique index before the batch
 * writes the new slugs. A single upsert checks that index per row, so one
 * statement cannot hand a slug from one taxon to another.
 */
export function slugsToVacate(writes: TaxonWrite[], known: KnownTaxon[]): { id: string; tempSlug: string }[] {
    const current = new Map(known.map(row => [row.igdbId, row]))
    return writes.flatMap(write => {
        const stored = current.get(write.igdbId)
        if (!stored || stored.slug === write.slug) return []
        return [{ id: stored.id, tempSlug: `seed-tmp-${stored.id}` }]
    })
}

const STEAM_TAKEN = 'Steam external ID is already associated with another catalogue game'

export type SteamOwnership = {
    final: Map<string, string>
    transfers: { externalId: string; fromGameId: string; gameId: string }[]
    inserts: { externalId: string; gameId: string }[]
}

/**
 * Final Steam ownership for the whole batch. A written game replaces the ids
 * it holds. An id released by one written game and claimed by another moves;
 * it is not deleted. A claim against any other owner, including a skipped
 * game, is refused. Two written games cannot claim the same id.
 */
export function planSteamOwnership(
    assignments: { gameId: string; appIds: number[] }[],
    owners: { externalId: string; gameId: string }[],
): SteamOwnership {
    const kept = new Map<string, Set<string>>()
    for (const row of assignments) {
        kept.set(row.gameId, new Set(row.appIds.map(appId => String(appId))))
    }
    const claimed = new Map<string, string>()
    for (const [gameId, ids] of kept) {
        for (const externalId of [...ids].sort()) {
            const prior = claimed.get(externalId)
            if (prior && prior !== gameId) throw new Error(STEAM_TAKEN)
            claimed.set(externalId, gameId)
        }
    }
    const ownerOf = new Map(owners.map(row => [row.externalId, row.gameId]))
    const transfers: SteamOwnership['transfers'] = []
    const inserts: SteamOwnership['inserts'] = []
    for (const externalId of [...claimed.keys()].sort()) {
        const gameId = claimed.get(externalId)!
        const owner = ownerOf.get(externalId)
        if (!owner || owner === gameId) {
            inserts.push({ externalId, gameId })
            continue
        }
        const ownerKept = kept.get(owner)
        if (ownerKept && !ownerKept.has(externalId)) {
            transfers.push({ externalId, fromGameId: owner, gameId })
            continue
        }
        throw new Error(STEAM_TAKEN)
    }
    return { final: claimed, transfers, inserts }
}

function rowsOf(result: unknown): Record<string, unknown>[] {
    return Array.isArray(result) ? result as Record<string, unknown>[] : []
}

function textOf(value: unknown): string | null {
    if (value == null) return null
    if (value instanceof Date) return value.toISOString()
    return String(value)
}

function dateOf(value: unknown): string | null {
    const text = textOf(value)
    return text ? text.slice(0, 10) : null
}

function numberOf(value: unknown): number | null {
    if (value == null || value === '') return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

function storedGame(row: Record<string, unknown>): StoredGame {
    const igdbId = numberOf(row.igdbId)
    const id = textOf(row.id)
    if (!id || igdbId == null) throw new Error('Catalogue game row is missing its id.')
    return {
        id, igdbId, slug: textOf(row.slug) ?? '', name: textOf(row.name) ?? '',
        providerSlug: textOf(row.providerSlug) ?? '', gameType: numberOf(row.gameType),
        released: dateOf(row.released), description: textOf(row.description),
        coverImageUrl: textOf(row.coverImageUrl), artworkImageUrl: textOf(row.artworkImageUrl),
        screenshots: Array.isArray(row.screenshots) ? row.screenshots.map(item => String(item)) : [],
        esrbRating: textOf(row.esrbRating), redditUrl: textOf(row.redditUrl),
        providerUpdatedAt: textOf(row.providerUpdatedAt), updatedAt: textOf(row.updatedAt),
    }
}

function inList(values: readonly (string | number)[]): SQL {
    return sql.join(values.map(value => sql`${value}`), sql`, `)
}

function textArray(values: readonly string[]): SQL {
    if (!values.length) return sql`'{}'::text[]`
    return sql`ARRAY[${sql.join(values.map(value => sql`${value}`), sql`, `)}]::text[]`
}

/** Sorted subquery so advisory locks are taken in id order inside one round trip. */
async function lockGames(tx: Executor, ids: number[]): Promise<void> {
    const sorted = [...new Set(ids)].sort((left, right) => left - right)
    if (!sorted.length) return
    await tx.execute(sql`select pg_advisory_xact_lock(1936745319, ordered.id) from (
        select id from (values ${sql.join(sorted.map(id => sql`(${id}::int)`), sql`, `)}) as v(id) order by id
    ) as ordered`)
}

async function lockSlugs(tx: Executor, slugs: string[]): Promise<void> {
    const sorted = [...new Set(slugs)].sort()
    if (!sorted.length) return
    await tx.execute(sql`select pg_advisory_xact_lock(1936745320, hashtext(ordered.slug)) from (
        select slug from (values ${sql.join(sorted.map(slug => sql`(${slug})`), sql`, `)}) as v(slug) order by slug
    ) as ordered`)
}

async function lockTaxonomy(tx: Executor): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(1936745322, hashtext(ordered.name)) from (
        select name from (values ${sql.join(RELATIONS.map((relation, index) => sql`(${relation.table}, ${index}::int)`), sql`, `)}) as v(name, ord)
        order by ord
    ) as ordered`)
}

export async function writeCatalogBatch(
    tx: Executor,
    games: CatalogGame[],
    options: { retainUnlistedSteamIds?: boolean } = {},
): Promise<{ written: number; skipped: number }> {
    const parsed = games.map(game => catalogGameSchema.parse(game))
    if (!parsed.length) return { written: 0, skipped: 0 }
    if (new Set(parsed.map(game => game.igdbId)).size !== parsed.length) throw new Error('Seed batch has duplicate IGDB ids.')
    await lockGames(tx, parsed.map(game => game.igdbId))
    const existing = rowsOf(await tx.execute(sql`select id::text as id, igdb_id as "igdbId", slug, name,
        provider_slug as "providerSlug", game_type as "gameType", released::text as released, description,
        cover_image_url as "coverImageUrl", artwork_image_url as "artworkImageUrl", screenshots,
        esrb_rating as "esrbRating", reddit_url as "redditUrl", provider_updated_at as "providerUpdatedAt",
        updated_at as "updatedAt"
        from public.games where igdb_id in (${inList(parsed.map(game => game.igdbId))})`)).map(storedGame)
    const newGames = parsed.filter(game => !existing.some(row => row.igdbId === game.igdbId))
    const bases = [...new Set(newGames.map(game => catalogSlug(game.providerSlug)))]
    if (bases.length) await lockSlugs(tx, bases)
    const taken = bases.length
        ? rowsOf(await tx.execute(sql`select slug from public.games where slug in (${inList(bases)})`)).map(row => textOf(row.slug) ?? '')
        : []
    const planned = planGameWrites(parsed, existing, taken)
    const writes = planned.filter(row => !row.skip)
    if (!writes.length) return { written: 0, skipped: planned.length }
    const updates = writes.filter(row => !row.isNew)
    const hasTaxa = writes.some(row => RELATIONS.some(relation => row.game[relation.key].length > 0))
    const needsTaxonomy = hasTaxa || updates.length > 0
    const known = new Map<RelationKey, KnownTaxon[]>()
    const oldLinks = new Map<string, Record<RelationKey, TaxonSnapshot[]>>()
    if (needsTaxonomy) {
        await lockTaxonomy(tx)
        if (hasTaxa) {
            const parts = RELATIONS.map(relation => {
                const taxa = writes.flatMap(row => row.game[relation.key])
                const ids = [...new Set(taxa.map(taxon => taxon.igdbId))]
                const slugs = [...new Set(taxa.flatMap(taxon => taxonCandidates(taxon.slug, taxon.igdbId)))]
                return ids.length ? { relation, ids, slugs } : null
            }).filter(part => part != null)
            if (parts.length) {
                const selected = rowsOf(await tx.execute(sql.join(parts.map(part => sql`select ${part.relation.key} as relation, id::text as id,
                    igdb_id as "igdbId", name, slug, provider_updated_at as "providerUpdatedAt"
                    from public.${sql.identifier(part.relation.table)}
                    where igdb_id in (${inList(part.ids)}) or slug in (${inList(part.slugs)})`), sql` union all `)))
                for (const relation of RELATIONS) known.set(relation.key, [])
                for (const row of selected) {
                    const key = textOf(row.relation) as RelationKey
                    const igdbId = numberOf(row.igdbId)
                    const id = textOf(row.id)
                    if (!igdbId || !id || !known.has(key)) continue
                    known.get(key)!.push({
                        igdbId, id, name: textOf(row.name) ?? '', slug: textOf(row.slug) ?? '',
                        providerUpdatedAt: textOf(row.providerUpdatedAt),
                    })
                }
            }
        }
        if (updates.length) {
            const selected = rowsOf(await tx.execute(sql.join(RELATIONS.map(relation => sql`select ${relation.key} as relation,
                j.game_id::text as "gameId", t.igdb_id as "igdbId", t.name, t.slug
                from public.${sql.identifier(relation.table)} t
                join public.${sql.identifier(relation.join)} j on j.${sql.identifier(relation.fk)} = t.id
                where j.game_id in (${inList(updates.map(row => row.id))})`), sql` union all `)))
            for (const row of updates) {
                oldLinks.set(row.id, { genres: [], platforms: [], developers: [], publishers: [] })
            }
            for (const row of selected) {
                const bucket = oldLinks.get(textOf(row.gameId) ?? '')
                const key = textOf(row.relation) as RelationKey
                const igdbId = numberOf(row.igdbId)
                if (!bucket || !igdbId || !(key in bucket)) continue
                bucket[key].push({ igdbId, name: textOf(row.name) ?? '', slug: textOf(row.slug) ?? '' })
            }
        }
    }
    const effective = new Map<RelationKey, EffectiveTaxon[][]>()
    const taxonWrites = new Map<RelationKey, TaxonWrite[]>()
    for (const relation of RELATIONS) {
        const plannedTaxa = planTaxonWrites(writes.map(row => ({ taxa: row.game[relation.key] })), known.get(relation.key) ?? [])
        effective.set(relation.key, plannedTaxa.effective)
        taxonWrites.set(relation.key, plannedTaxa.writes)
    }
    const steamIds = [...new Set(writes.flatMap(row => row.game.steamAppIds))]
    const steamRows = steamIds.length || updates.length
        ? rowsOf(await tx.execute(sql`select external_id as "externalId", game_id::text as "gameId"
            from public.game_external_ids where provider = 'steam' and (${steamIds.length
                ? sql`external_id in (${inList(steamIds.map(String))})` : sql`false`}
                ${updates.length ? sql`or game_id in (${inList(updates.map(row => row.id))})` : sql``})`))
        : []
    const owners = steamRows.map(row => ({ externalId: textOf(row.externalId) ?? '', gameId: textOf(row.gameId) ?? '' }))
    const steamPlan = planSteamOwnership(writes.map(row => ({ gameId: row.id, appIds: row.game.steamAppIds })), owners)
    const claimed = steamPlan.final
    const oldSteam = new Map<string, number[]>()
    for (const row of owners) {
        const appId = Number(row.externalId)
        if (!Number.isInteger(appId)) continue
        oldSteam.set(row.gameId, [...(oldSteam.get(row.gameId) ?? []), appId])
    }
    for (const [index, row] of writes.entries()) {
        if (row.isNew) continue
        const stored = row.stored
        if (!stored) continue
        const previousTaxa = oldLinks.get(row.id) ?? { genres: [], platforms: [], developers: [], publishers: [] } as Record<RelationKey, TaxonSnapshot[]>
        const previous = catalogContent({
            ...stored, genres: previousTaxa.genres, platforms: previousTaxa.platforms,
            developers: previousTaxa.developers, publishers: previousTaxa.publishers,
            steamAppIds: oldSteam.get(row.id) ?? [],
        })
        const next = catalogContent({
            ...row.game,
            genres: effective.get('genres')?.[index] ?? [],
            platforms: effective.get('platforms')?.[index] ?? [],
            developers: effective.get('developers')?.[index] ?? [],
            publishers: effective.get('publishers')?.[index] ?? [],
        })
        row.changed = previous !== next
    }
    const now = new Date().toISOString()
    await tx.execute(sql`insert into public.games (
        id, igdb_id, name, provider_slug, game_type, released, description, cover_image_url, artwork_image_url,
        screenshots, esrb_rating, reddit_url, provider_updated_at, metadata_synced_at, slug, updated_at
    ) values ${sql.join(writes.map(row => sql`(
        ${row.id}::uuid, ${row.game.igdbId}::int, ${row.game.name}, ${row.game.providerSlug}, ${row.game.gameType}::int,
        ${row.game.released}::date, ${row.game.description}, ${row.game.coverImageUrl}, ${row.game.artworkImageUrl},
        ${textArray(row.game.screenshots)}, ${row.game.esrbRating}, ${row.game.redditUrl},
        ${row.game.providerUpdatedAt}::timestamptz, ${now}::timestamptz, ${row.slug},
        ${(row.changed ? now : row.existingUpdatedAt ?? now)}::timestamptz
    )`), sql`, `)}
    on conflict (igdb_id) do update set
        name = excluded.name, provider_slug = excluded.provider_slug, game_type = excluded.game_type,
        released = excluded.released, description = excluded.description, cover_image_url = excluded.cover_image_url,
        artwork_image_url = excluded.artwork_image_url, screenshots = excluded.screenshots,
        esrb_rating = excluded.esrb_rating, reddit_url = excluded.reddit_url,
        provider_updated_at = excluded.provider_updated_at, metadata_synced_at = excluded.metadata_synced_at,
        updated_at = excluded.updated_at`)
    for (const relation of RELATIONS) {
        const taxonRows = taxonWrites.get(relation.key) ?? []
        const vacated = slugsToVacate(taxonRows, known.get(relation.key) ?? [])
        if (vacated.length) {
            await tx.execute(sql`update public.${sql.identifier(relation.table)} as current_taxon
                set slug = vacated.slug
                from (values ${sql.join(vacated.map(row => sql`(${row.id}::uuid, ${row.tempSlug})`), sql`, `)}) as vacated(id, slug)
                where current_taxon.id = vacated.id`)
        }
        if (taxonRows.length) {
            await tx.execute(sql`insert into public.${sql.identifier(relation.table)} as current_taxon
                (id, igdb_id, name, slug, provider_updated_at)
                values ${sql.join(taxonRows.map(taxon => sql`(${taxon.id}::uuid, ${taxon.igdbId}::int, ${taxon.name}, ${taxon.slug}, ${taxon.providerUpdatedAt}::timestamptz)`), sql`, `)}
                on conflict (igdb_id) do update set name = excluded.name, slug = excluded.slug,
                    provider_updated_at = excluded.provider_updated_at
                where excluded.provider_updated_at is not null and (current_taxon.provider_updated_at is null
                    or excluded.provider_updated_at > current_taxon.provider_updated_at)`)
        }
        if (updates.length) {
            await tx.execute(sql`delete from public.${sql.identifier(relation.join)}
                where game_id in (${inList(updates.map(row => row.id))})`)
        }
        const links = writes.flatMap((row, index) => (effective.get(relation.key)?.[index] ?? [])
            .map(taxon => sql`(${row.id}::uuid, ${taxon.id}::uuid)`))
        if (links.length) {
            await tx.execute(sql`insert into public.${sql.identifier(relation.join)} (game_id, ${sql.identifier(relation.fk)})
                values ${sql.join(links, sql`, `)} on conflict do nothing`)
        }
    }
    if (steamPlan.transfers.length) {
        await tx.execute(sql`update public.game_external_ids as stored
            set game_id = moved.game_id, verified_at = ${now}::timestamptz
            from (values ${sql.join(steamPlan.transfers.map(row => sql`(${row.externalId}, ${row.gameId}::uuid, ${row.fromGameId}::uuid)`), sql`, `)})
                as moved(external_id, game_id, from_game_id)
            where stored.provider = 'steam' and stored.external_id = moved.external_id
                and stored.game_id = moved.from_game_id`)
    }
    if (!options.retainUnlistedSteamIds && claimed.size) {
        const pairs = [...claimed].map(([externalId, gameId]) => sql`(${externalId}, ${gameId}::uuid)`)
        await tx.execute(sql`insert into public.game_external_ids (provider, external_id, game_id, match_method, verified_at)
            values ${sql.join([...claimed].map(([externalId, gameId]) => sql`('steam', ${externalId}, ${gameId}::uuid, 'igdb_external_id', ${now}::timestamptz)`), sql`, `)}
            on conflict (provider, external_id) do update set verified_at = excluded.verified_at
            where public.game_external_ids.game_id = excluded.game_id`)
        if (updates.length) {
            await tx.execute(sql`delete from public.game_external_ids as stored
                where stored.provider = 'steam' and stored.game_id in (${inList(updates.map(row => row.id))})
                and not exists (select 1 from (values ${sql.join(pairs, sql`, `)}) as kept(external_id, game_id)
                    where kept.game_id = stored.game_id and kept.external_id = stored.external_id)`)
        }
    } else if (!options.retainUnlistedSteamIds && updates.length) {
        await tx.execute(sql`delete from public.game_external_ids
            where provider = 'steam' and game_id in (${inList(updates.map(row => row.id))})`)
    }
    return { written: writes.length, skipped: planned.length - writes.length }
}
