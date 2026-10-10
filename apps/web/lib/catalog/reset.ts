import 'server-only'
import { createHash } from 'node:crypto'
import { sql, type SQL } from 'drizzle-orm'
import type { DB } from '@/lib/db'
import { catalogGameSchema, writeCatalogGame } from './upsert'
import { detachSharedSteamAppIds, omitForeignSteamIds } from './steam-ids'
import { manifestChecksum, type CatalogResetManifest } from './manifest'
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
    for (const game of manifest.games) catalogGameSchema.parse(game)
}

async function retentionFingerprint(executor: { execute: (query: SQL) => Promise<unknown> }): Promise<string> {
    const rows = await executor.execute(sql`select jsonb_build_object(
        'users', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from (
            select id, username, display_name, avatar_url, selected_title, user_bio,
                default_list_public, library_public, loadout_public, profile_loadout_bio
            from public.users) t),
        'lists', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from (
            select id, user_id, name, description, is_public, is_default, is_pinned from public.lists) t),
        'follows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.follower_id, t.following_id), '[]'::jsonb) from (
            select follower_id, following_id from public.follows) t),
        'listLikes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.list_id), '[]'::jsonb) from (
            select user_id, list_id from public.list_likes) t),
        'steam', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id), '[]'::jsonb) from (
            select user_id, steam_id, profile_public, linked_at, last_synced_at from public.steam_accounts) t)
    ) as fingerprint`) as { fingerprint: unknown }[]
    return createHash('sha256').update(JSON.stringify(rows[0]?.fingerprint ?? null)).digest('hex')
}

export type ResetCounts = {
    library: number; reviews: number; memberships: number; favourites: number
    users: number; lists: number; follows: number; likes: number; steam: number; games: number
}
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
    const manifest = { runId, fingerprint: await retentionFingerprint(database), games }
    assertManifest(manifest)
    return manifest
}

export async function planCatalogReset(database: Database, manifest: CatalogResetManifest) {
    assertManifest(manifest)
    const fingerprint = await retentionFingerprint(database)
    return {
        fingerprintMatches: fingerprint === manifest.fingerprint,
        checksum: manifestChecksum(manifest.fingerprint, manifest.games),
        ...(await counts(database)),
    }
}

export async function applyCatalogReset(database: Database, manifest: CatalogResetManifest, options: { resolveSharedSteamIds?: boolean; afterClear?: () => Promise<void> } = {}) {
    assertManifest(manifest)
    const resolve = options.resolveSharedSteamIds !== false
    return database.transaction(async tx => {
        await tx.execute(sql`set local lock_timeout = '5s'`)
        await tx.execute(sql`set local statement_timeout = '10min'`)
        await tx.execute(sql`select pg_advisory_xact_lock(1936745321, 1)`)
        const fingerprint = await retentionFingerprint(tx)
        if (fingerprint !== manifest.fingerprint) throw new Error('Stale reset manifest: retained rows changed since it was staged.')
        const checksum = manifestChecksum(manifest.fingerprint, manifest.games)
        const existing = await tx.execute(sql`select run_id from igdb_private.catalog_reset_runs
            where run_id = ${manifest.runId}::uuid or manifest_checksum = ${checksum} limit 1`)
        if (existing.length) throw new Error('This reset manifest was already committed. Stage a new snapshot.')
        const before = await counts(tx)
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

/** In-database copy for a disposable rehearsal. A hosted database still needs pg_dump. */
export async function backupResetState(sql: MigrationSql): Promise<void> {
    await sql.unsafe('DROP SCHEMA IF EXISTS reset_backup CASCADE')
    await sql.unsafe('CREATE SCHEMA reset_backup')
    for (const table of [...RESTORE_ORDER, 'users']) await sql.unsafe(`CREATE TABLE reset_backup.${table} AS TABLE public.${table}`)
    await sql.unsafe('CREATE TABLE reset_backup.steam_match_cache AS TABLE igdb_private.steam_match_cache')
    await sql.unsafe('CREATE TABLE reset_backup.catalog_reset_runs AS TABLE igdb_private.catalog_reset_runs')
}

export async function restoreResetState(sql: MigrationSql): Promise<void> {
    await sql.begin(async tx => {
        for (const statement of CLEAR) await tx.unsafe(statement)
        for (const table of RESTORE_ORDER) await tx.unsafe(`INSERT INTO public.${table} SELECT * FROM reset_backup.${table}`)
        await tx.unsafe(`UPDATE public.users u SET favorite_game_ids = b.favorite_game_ids,
            loadout_identity = b.loadout_identity, loadout_identity_at = b.loadout_identity_at
            FROM reset_backup.users b WHERE u.id = b.id`)
        await tx.unsafe('INSERT INTO igdb_private.steam_match_cache SELECT * FROM reset_backup.steam_match_cache')
        await tx.unsafe('DELETE FROM igdb_private.catalog_reset_runs')
        await tx.unsafe('INSERT INTO igdb_private.catalog_reset_runs SELECT * FROM reset_backup.catalog_reset_runs')
    })
}
