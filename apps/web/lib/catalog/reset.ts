import 'server-only'
import { sql, type SQL } from 'drizzle-orm'
import type { DB } from '@/lib/db'
import { catalogGameSchema, writeCatalogGame } from './upsert'
import { detachSharedSteamAppIds, omitForeignSteamIds } from './steam-ids'
import { manifestChecksum, type CatalogResetManifest, type ResetCounts } from './manifest'
import type { CatalogGame } from './types'
import type { MigrationSql } from './migrations'

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0]
type Database = Pick<DB, 'execute' | 'transaction'>

const CLEAR = [
    'delete from public.list_games',
    'delete from public.ratings_reviews',
    'delete from public.library_entries',
    `update public.users set favorite_game_ids = '{}'::uuid[], loadout_identity = null, loadout_identity_at = null`,
    'delete from public.game_genres',
    'delete from public.game_platforms',
    'delete from public.game_developers',
    'delete from public.game_publishers',
    'delete from public.game_external_ids',
    'delete from public.games',
    'delete from public.genres',
    'delete from public.platforms',
    'delete from public.developers',
    'delete from public.publishers',
    'delete from igdb_private.steam_match_cache',
]
const RESTORE_ORDER = ['genres', 'platforms', 'developers', 'publishers', 'games', 'game_genres', 'game_platforms', 'game_developers', 'game_publishers', 'game_external_ids', 'library_entries', 'ratings_reviews', 'list_games']

function assertManifest(manifest: CatalogResetManifest): void {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(manifest.runId))
        throw new Error('Reset run id must be a UUID.')
    assertCounts(manifest.counts)
    if (!Array.isArray(manifest.games)) throw new Error('Reset manifest is missing staged games.')
    for (const game of manifest.games) catalogGameSchema.parse(game)
}

const COUNT_KEYS = ['library', 'reviews', 'memberships', 'favourites', 'users', 'lists', 'follows', 'likes', 'steam', 'games'] as const

function assertCounts(counts: ResetCounts | undefined): asserts counts is ResetCounts {
    if (!counts || COUNT_KEYS.some(key => !Number.isInteger(counts[key]) || counts[key] < 0))
        throw new Error('Reset manifest is missing staged counts. Write it again with the current command.')
}

function sameCounts(left: ResetCounts, right: ResetCounts): boolean {
    return COUNT_KEYS.every(key => left[key] === right[key])
}

/** Empty and implausibly small staged catalogues are refused unless the operator overrides them. */
export function resetSizeBlock(currentGames: number, writing: number, options: { allowEmpty?: boolean; allowSmall?: boolean } = {}): string | null {
    // Zero games is the empty-catalogue gate. --allow-empty covers that at any current size, including 25 or more.
    // --allow-small is only for a non-empty manifest under the floor.
    if (writing === 0) {
        if (currentGames > 0 && !options.allowEmpty)
            return `Refusing to apply an empty catalogue over ${currentGames} existing games. Pass --allow-empty only when an empty catalogue is intentional.`
        return null
    }
    if (currentGames >= 25) {
        const floor = Math.min(25, Math.ceil(currentGames * 0.1))
        if (writing < floor && !options.allowSmall)
            return `Refusing to replace ${currentGames} games with ${writing}. Pass --allow-small only for a deliberate partial catalogue.`
    }
    return null
}

async function retentionFingerprint(executor: { execute: (query: SQL) => Promise<unknown> }): Promise<string> {
    // Hash every row the reset deletes or retains, including library, reviews,
    // list memberships, favourites and generated Loadout text.
    const rows = await executor.execute(sql`select encode(digest(convert_to((jsonb_build_object(
        'users', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from (select * from public.users) t),
        'lists', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from (select * from public.lists) t),
        'follows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.follower_id, t.following_id), '[]'::jsonb) from (select * from public.follows) t),
        'listLikes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.list_id), '[]'::jsonb) from (select * from public.list_likes) t),
        'steam', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id), '[]'::jsonb) from (select * from public.steam_accounts) t),
        'library', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from (select * from public.library_entries) t),
        'reviews', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from (select * from public.ratings_reviews) t),
        'memberships', (select coalesce(jsonb_agg(to_jsonb(t) order by t.list_id, t.game_id), '[]'::jsonb) from (select * from public.list_games) t),
        'games', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from (select * from public.games) t),
        'genres', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from (select * from public.genres) t),
        'platforms', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from (select * from public.platforms) t),
        'developers', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from (select * from public.developers) t),
        'publishers', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from (select * from public.publishers) t),
        'gameGenres', (select coalesce(jsonb_agg(to_jsonb(t) order by t.game_id, t.genre_id), '[]'::jsonb) from (select * from public.game_genres) t),
        'gamePlatforms', (select coalesce(jsonb_agg(to_jsonb(t) order by t.game_id, t.platform_id), '[]'::jsonb) from (select * from public.game_platforms) t),
        'gameDevelopers', (select coalesce(jsonb_agg(to_jsonb(t) order by t.game_id, t.developer_id), '[]'::jsonb) from (select * from public.game_developers) t),
        'gamePublishers', (select coalesce(jsonb_agg(to_jsonb(t) order by t.game_id, t.publisher_id), '[]'::jsonb) from (select * from public.game_publishers) t),
        'externalIds', (select coalesce(jsonb_agg(to_jsonb(t) order by t.provider, t.external_id), '[]'::jsonb) from (select * from public.game_external_ids) t),
        'matchCache', (select coalesce(jsonb_agg(to_jsonb(t) order by t.steam_app_id, t.matcher_version), '[]'::jsonb) from (select * from igdb_private.steam_match_cache) t)
    ))::text, 'UTF8'), 'sha256'), 'hex') as fingerprint`) as { fingerprint: string }[]
    const fingerprint = rows[0]?.fingerprint
    if (typeof fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(fingerprint)) throw new Error('Could not fingerprint reset state.')
    return fingerprint
}

export type { ResetCounts }
async function counts(executor: { execute: (query: SQL) => Promise<unknown> }): Promise<ResetCounts> {
    const rows = await executor.execute(sql`select
        (select count(*)::int from public.library_entries) as library,
        (select count(*)::int from public.ratings_reviews) as reviews,
        (select count(*)::int from public.list_games) as memberships,
        (select coalesce(sum(cardinality(favorite_game_ids)), 0)::int from public.users) as favourites,
        (select count(*)::int from public.users) as users,
        (select count(*)::int from public.lists) as lists,
        (select count(*)::int from public.follows) as follows,
        (select count(*)::int from public.list_likes) as likes,
        (select count(*)::int from public.steam_accounts) as steam,
        (select count(*)::int from public.games) as games`) as ResetCounts[]
    return rows[0]
}

async function clearGameLinked(tx: Tx): Promise<void> {
    for (const statement of CLEAR) await tx.execute(sql.raw(statement))
}

export async function buildManifest(database: Database, games: CatalogGame[], runId: string): Promise<CatalogResetManifest> {
    const manifest = { runId, fingerprint: await retentionFingerprint(database), counts: await counts(database), games }
    assertManifest(manifest)
    return manifest
}

export async function planCatalogReset(database: Database, manifest: CatalogResetManifest, options: { allowEmpty?: boolean; allowSmall?: boolean } = {}) {
    assertManifest(manifest)
    const fingerprint = await retentionFingerprint(database)
    const current = await counts(database)
    const writing = manifest.games.length
    return {
        fingerprintMatches: fingerprint === manifest.fingerprint,
        countsMatch: sameCounts(current, manifest.counts),
        checksum: manifestChecksum(manifest.fingerprint, manifest.games, manifest.counts),
        writing,
        stagedCounts: manifest.counts,
        blocked: resetSizeBlock(current.games, writing, options),
        ...current,
    }
}

export async function applyCatalogReset(database: Database, manifest: CatalogResetManifest, options: { resolveSharedSteamIds?: boolean; allowEmpty?: boolean; allowSmall?: boolean; afterClear?: () => Promise<void> } = {}) {
    assertManifest(manifest)
    const resolve = options.resolveSharedSteamIds !== false
    return database.transaction(async tx => {
        await tx.execute(sql`set local lock_timeout = '5s'`)
        await tx.execute(sql`set local statement_timeout = '10min'`)
        await tx.execute(sql`select pg_advisory_xact_lock(1936745321, 1)`)
        // A committed run has already changed the rows the fingerprint covers, so replay is checked first.
        const checksum = manifestChecksum(manifest.fingerprint, manifest.games, manifest.counts)
        const existing = await tx.execute(sql`select run_id from igdb_private.catalog_reset_runs
            where run_id = ${manifest.runId}::uuid or manifest_checksum = ${checksum} limit 1`)
        if (existing.length) throw new Error('This reset manifest was already committed. Stage a new snapshot.')
        const fingerprint = await retentionFingerprint(tx)
        if (fingerprint !== manifest.fingerprint) throw new Error('Stale reset manifest: rows changed since it was staged.')
        const before = await counts(tx)
        if (!sameCounts(before, manifest.counts)) throw new Error('Stale reset manifest: staged counts no longer match the database.')
        const blocked = resetSizeBlock(before.games, manifest.games.length, options)
        if (blocked) throw new Error(blocked)
        await clearGameLinked(tx)
        if (options.afterClear) await options.afterClear()
        const staged = resolve ? detachSharedSteamAppIds(manifest.games) : { games: manifest.games, shared: [] as { appId: number; igdbIds: number[] }[] }
        for (const game of staged.games) {
            const prepared = await omitForeignSteamIds(tx, game)
            await writeCatalogGame(tx, prepared.game)
        }
        await tx.execute(sql`insert into igdb_private.catalog_reset_runs (run_id, manifest_checksum) values (${manifest.runId}::uuid, ${checksum})`)
        return { cleared: before, shared: staged.shared, written: staged.games.length, fingerprint }
    })
}

export async function resetFromProvider(database: Database, load: () => Promise<CatalogGame[]>, runId: string) {
    const games = await load()
    return applyCatalogReset(database, await buildManifest(database, games, runId))
}

function backupSchema(name: string): string {
    if (!/^reset_backup(?:_[1-9][0-9]*)?$/.test(name)) throw new Error('Unknown reset backup schema.')
    return name
}

/** In-database copy for a disposable rehearsal. Never drops an earlier backup. A hosted database still needs pg_dump. */
export async function backupResetState(sql: MigrationSql): Promise<string> {
    const existing = await sql.unsafe(`select nspname from pg_namespace where nspname = 'reset_backup' or nspname ~ '^reset_backup_[1-9][0-9]*$'`)
    const names = new Set(existing.map(row => String(row.nspname)))
    let schema = 'reset_backup'
    if (names.has(schema)) {
        let n = 2
        while (names.has(`reset_backup_${n}`)) n++
        schema = `reset_backup_${n}`
    }
    schema = backupSchema(schema)
    await sql.unsafe(`CREATE SCHEMA ${schema}`)
    for (const table of [...RESTORE_ORDER, 'users']) await sql.unsafe(`CREATE TABLE ${schema}.${table} AS TABLE public.${table}`)
    await sql.unsafe(`CREATE TABLE ${schema}.steam_match_cache AS TABLE igdb_private.steam_match_cache`)
    await sql.unsafe(`CREATE TABLE ${schema}.catalog_reset_runs AS TABLE igdb_private.catalog_reset_runs`)
    return schema
}

export async function restoreResetState(sql: MigrationSql, schema = 'reset_backup'): Promise<void> {
    const source = backupSchema(schema)
    await sql.begin(async tx => {
        for (const statement of CLEAR) await tx.unsafe(statement)
        for (const table of RESTORE_ORDER) await tx.unsafe(`INSERT INTO public.${table} SELECT * FROM ${source}.${table}`)
        await tx.unsafe(`UPDATE public.users u SET favorite_game_ids = b.favorite_game_ids,
            loadout_identity = b.loadout_identity, loadout_identity_at = b.loadout_identity_at
            FROM ${source}.users b WHERE u.id = b.id`)
        await tx.unsafe(`INSERT INTO igdb_private.steam_match_cache SELECT * FROM ${source}.steam_match_cache`)
        await tx.unsafe('DELETE FROM igdb_private.catalog_reset_runs')
        await tx.unsafe(`INSERT INTO igdb_private.catalog_reset_runs SELECT * FROM ${source}.catalog_reset_runs`)
    })
}
