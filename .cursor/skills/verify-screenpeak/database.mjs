// Local Postgres: role and database, migrations, local-app SQL, and the catalogue seed.
import { spawnSync } from 'node:child_process'
import { closeSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    authenticatorPassword, catalogueTop, databaseUrl, dbName, dbPassword, dbUser, libraryPath, logDir, peekEmail,
    peekPassword, peekUsername, root, runDir,
} from './config.mjs'
import { twitchReady } from './env.mjs'
import { log, mkdirSyncSafe } from './runtime.mjs'

export function psql(url, sql, args = []) {
    const result = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-X', ...args], {
        input: sql,
        encoding: 'utf8',
    })
    if (result.status !== 0) {
        throw new Error((result.stderr || result.stdout || `psql exited ${result.status}`).trim())
    }
    return (result.stdout || '').trim()
}

export function sudoPsql(sql) {
    const result = spawnSync('sudo', ['-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-X', '-d', 'postgres'], {
        input: sql,
        encoding: 'utf8',
    })
    if (result.status !== 0) {
        throw new Error((result.stderr || result.stdout || `sudo psql exited ${result.status}`).trim())
    }
    return (result.stdout || '').trim()
}

export async function ensurePostgres() {
    const ready = spawnSync('pg_isready', ['-h', '127.0.0.1'], { encoding: 'utf8' })
    if (ready.status !== 0) {
        throw new Error('Local Postgres is not accepting connections on 127.0.0.1. Start it, then rerun up. This skill does not connect to a hosted database.')
    }
    sudoPsql(`
        DO $$ BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${dbUser}') THEN
                CREATE ROLE ${dbUser} LOGIN PASSWORD '${dbPassword}' SUPERUSER;
            END IF;
        END $$;
        ALTER ROLE ${dbUser} WITH LOGIN PASSWORD '${dbPassword}' SUPERUSER;
        SELECT 'ok';
    `)
    const exists = sudoPsql(`SELECT 1 FROM pg_database WHERE datname = '${dbName}'`)
    if (!exists.includes('1')) {
        sudoPsql(`CREATE DATABASE ${dbName} OWNER ${dbUser}`)
    }
}

function databaseHasGames() {
    try {
        const line = psql(databaseUrl, `select to_regclass('public.games')`, ['-tA'])
        return line === 'games'
    } catch {
        return false
    }
}

export function applyMigrations() {
    if (!databaseHasGames()) {
        const stubs = join(root, 'apps/web/db/local/auth-stubs.sql')
        psql(databaseUrl, readFileSync(stubs, 'utf8'))
    }
    const result = spawnSync('npm', ['run', 'migrate:journal', '-w', '@screenpeak/web', '--', '--database-env', 'LOCAL_DATABASE_URL', '--apply-pending'], {
        cwd: root,
        encoding: 'utf8',
        env: process.env,
    })
    if (result.status !== 0) {
        throw new Error((result.stderr || result.stdout || 'migrate:journal failed').trim())
    }
    log(result.stdout.trim())
}

export function applyLocalAppSql() {
    psql(databaseUrl, `
        DO $$ BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
                CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD '${authenticatorPassword}';
            END IF;
        END $$;
        ALTER ROLE authenticator WITH NOINHERIT LOGIN PASSWORD '${authenticatorPassword}';
        GRANT anon TO authenticator;
        GRANT authenticated TO authenticator;
        GRANT USAGE ON SCHEMA public TO anon, authenticated;
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
        GRANT UPDATE ON TABLE public.users TO authenticated;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
        LANGUAGE plpgsql STABLE
        AS $fn$
        DECLARE
            claims text;
        BEGIN
            claims := current_setting('request.jwt.claims', true);
            IF claims IS NULL OR btrim(claims) = '' THEN
                RETURN NULL;
            END IF;
            RETURN NULLIF(claims::json ->> 'sub', '')::uuid;
        END;
        $fn$;

        CREATE SCHEMA IF NOT EXISTS verify_local;
        REVOKE ALL ON SCHEMA verify_local FROM PUBLIC, anon, authenticated;
        CREATE TABLE IF NOT EXISTS verify_local.passwords (
            user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
            password text NOT NULL
        );
        REVOKE ALL ON TABLE verify_local.passwords FROM PUBLIC, anon, authenticated;

        INSERT INTO auth.users (id, email, raw_user_meta_data)
        SELECT gen_random_uuid(), '${peekEmail}', '{"username":"${peekUsername}"}'::jsonb
        WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = '${peekEmail}');

        INSERT INTO verify_local.passwords (user_id, password)
        SELECT id, '${peekPassword}' FROM auth.users WHERE email = '${peekEmail}'
        ON CONFLICT (user_id) DO UPDATE SET password = EXCLUDED.password;

        UPDATE public.users
        SET username = '${peekUsername}', display_name = '${peekUsername}', loadout_public = true
        WHERE id = (SELECT id FROM auth.users WHERE email = '${peekEmail}');
    `)
}

function writeLibrary(library) {
    mkdirSyncSafe(runDir)
    writeFileSync(libraryPath, JSON.stringify(library, null, 2))
    return library
}

export function readLibrary() {
    return JSON.parse(readFileSync(libraryPath, 'utf8'))
}

function clearPeekLibrary() {
    psql(databaseUrl, `
        DELETE FROM ratings_reviews WHERE user_id = (SELECT id FROM users WHERE username = '${peekUsername}');
        DELETE FROM library_entries WHERE user_id = (SELECT id FROM users WHERE username = '${peekUsername}');
        UPDATE users
        SET loadout_identity = NULL, loadout_identity_at = NULL, profile_loadout_bio = NULL
        WHERE username = '${peekUsername}';
    `)
}

function givePeekFive(gameIds, marker, mode) {
    if (gameIds.length < 5) throw new Error(`Need 5 catalogue games for peek's library, found ${gameIds.length}.`)
    const ids = gameIds.slice(0, 5)
    if (ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) throw new Error('Catalogue game id was not a uuid.')
    clearPeekLibrary()
    const libraryRows = ids.map((id, index) => `('${id}'::uuid, ${index < 3 ? "'completed'" : "'playing'"})`).join(', ')
    const ratingRows = ids.map((id, index) => `('${id}'::uuid, ${[9, 8, 8, 7, 6][index]})`).join(', ')
    psql(databaseUrl, `
        INSERT INTO library_entries (user_id, game_id, status, source)
        SELECT u.id, rows.game_id, rows.status, 'manual'
        FROM users u
        JOIN (VALUES ${libraryRows}) AS rows(game_id, status) ON true
        WHERE u.username = '${peekUsername}';

        INSERT INTO ratings_reviews (user_id, game_id, rating, review)
        SELECT u.id, rows.game_id, rows.rating, ''
        FROM users u
        JOIN (VALUES ${ratingRows}) AS rows(game_id, rating) ON true
        WHERE u.username = '${peekUsername}';
    `)
    const names = psql(databaseUrl, `select name from games where id in (${ids.map((id) => `'${id}'`).join(', ')}) order by name`, ['-tA'])
        .split('\n').filter(Boolean)
    return writeLibrary({ mode, marker, games: names })
}

function seedFixture() {
    psql(databaseUrl, `
        INSERT INTO genres (igdb_id, name, slug)
        VALUES (910001, 'Fixture Roguelike', 'fixture-roguelike')
        ON CONFLICT (igdb_id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug;

        INSERT INTO developers (igdb_id, name, slug)
        VALUES (910001, 'Fixture Studio', 'fixture-studio')
        ON CONFLICT (igdb_id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug;

        INSERT INTO publishers (igdb_id, name, slug)
        VALUES (910001, 'Fixture Press', 'fixture-press')
        ON CONFLICT (igdb_id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug;

        DELETE FROM games WHERE slug LIKE 'peak-fixture-%';

        INSERT INTO games (igdb_id, name, slug)
        VALUES
            (910101, 'Peak Fixture 1', 'peak-fixture-1'),
            (910102, 'Peak Fixture 2', 'peak-fixture-2'),
            (910103, 'Peak Fixture 3', 'peak-fixture-3'),
            (910104, 'Peak Fixture 4', 'peak-fixture-4'),
            (910105, 'Peak Fixture 5', 'peak-fixture-5');

        INSERT INTO game_genres (game_id, genre_id)
        SELECT g.id, gn.id FROM games g JOIN genres gn ON gn.slug = 'fixture-roguelike'
        WHERE g.slug LIKE 'peak-fixture-%';

        INSERT INTO game_developers (game_id, developer_id)
        SELECT g.id, d.id FROM games g JOIN developers d ON d.slug = 'fixture-studio'
        WHERE g.slug LIKE 'peak-fixture-%';

        INSERT INTO game_publishers (game_id, publisher_id)
        SELECT g.id, p.id FROM games g JOIN publishers p ON p.slug = 'fixture-press'
        WHERE g.slug LIKE 'peak-fixture-%';

        INSERT INTO library_entries (user_id, game_id, status, source)
        SELECT u.id, g.id,
            CASE WHEN g.slug IN ('peak-fixture-1', 'peak-fixture-2', 'peak-fixture-3') THEN 'completed' ELSE 'playing' END,
            'manual'
        FROM users u
        JOIN games g ON g.slug LIKE 'peak-fixture-%'
        WHERE u.username = '${peekUsername}';

        INSERT INTO ratings_reviews (user_id, game_id, rating, review)
        SELECT u.id, g.id, scores.rating, ''
        FROM users u
        JOIN games g ON true
        JOIN (VALUES
            ('peak-fixture-1', 9),
            ('peak-fixture-2', 8),
            ('peak-fixture-3', 8),
            ('peak-fixture-4', 7),
            ('peak-fixture-5', 6)
        ) AS scores(slug, rating) ON scores.slug = g.slug
        WHERE u.username = '${peekUsername}';

        UPDATE users
        SET loadout_identity = NULL, loadout_identity_at = NULL, profile_loadout_bio = NULL
        WHERE username = '${peekUsername}';
    `)
    return writeLibrary({ mode: 'fixture', marker: 'Fixture Roguelike', games: [
        'Peak Fixture 1', 'Peak Fixture 2', 'Peak Fixture 3', 'Peak Fixture 4', 'Peak Fixture 5',
    ] })
}

export function safeSeedLines(text) {
    return text.split('\n').filter((line) => {
        const trimmed = line.trim()
        return trimmed.startsWith('igdb seed:') || trimmed.startsWith('{') || trimmed.startsWith('}') || trimmed.startsWith('"')
    }).join('\n')
}

function seedIgdbTop() {
    mkdirSyncSafe(logDir)
    const logPath = join(logDir, 'seed-igdb.log')
    const fd = openSync(logPath, 'w')
    log(`Seeding ${catalogueTop} IGDB main games into ${dbName} on 127.0.0.1`)
    const result = spawnSync('npm', ['run', 'seed:igdb', '-w', '@screenpeak/web', '--', '--database-env', 'LOCAL_DATABASE_URL', '--top', String(catalogueTop)], {
        cwd: root,
        stdio: ['ignore', fd, fd],
        env: process.env,
    })
    closeSync(fd)
    let summary = ''
    try { summary = safeSeedLines(readFileSync(logPath, 'utf8')) } catch { /* log may be empty */ }
    if (summary) log(summary)
    const stored = Number(psql(databaseUrl, 'select count(*) from games', ['-tA']) || '0')
    if (result.status !== 0 && stored < 5) {
        throw new Error(`seed:igdb --top ${catalogueTop} failed (status ${result.status}) and wrote ${stored} games. Twitch keys were set, so this does not fall back to fixtures. See ${logPath}.`)
    }
    if (result.status !== 0) log(`seed:igdb exited ${result.status} after writing ${stored} games. Continuing with those rows.`)
    const picked = psql(databaseUrl, `
        select gn.id::text || '|' || gn.name
        from genres gn
        join game_genres gg on gg.genre_id = gn.id
        group by gn.id, gn.name
        having count(*) >= 5
        order by count(*) desc, gn.name
        limit 1
    `, ['-tA'])
    let gameIds
    let marker
    if (picked) {
        const separator = picked.indexOf('|')
        const genreId = picked.slice(0, separator)
        marker = picked.slice(separator + 1)
        if (!/^[0-9a-f-]{36}$/i.test(genreId)) throw new Error('Genre id from the local catalogue was not a uuid.')
        const withCompanies = `
            select g.id::text from games g
            join game_genres gg on gg.game_id = g.id
            where gg.genre_id = '${genreId}'
              and exists (select 1 from game_developers gd where gd.game_id = g.id)
              and exists (select 1 from game_publishers gp where gp.game_id = g.id)
            order by g.name
            limit 5
        `
        gameIds = psql(databaseUrl, withCompanies, ['-tA']).split('\n').filter(Boolean)
        if (gameIds.length < 5) {
            gameIds = psql(databaseUrl, `
                select g.id::text from games g
                join game_genres gg on gg.game_id = g.id
                where gg.genre_id = '${genreId}'
                order by g.name
                limit 5
            `, ['-tA']).split('\n').filter(Boolean)
        }
    } else {
        gameIds = psql(databaseUrl, `
            select g.id::text from games g
            where exists (select 1 from game_developers gd where gd.game_id = g.id)
              and exists (select 1 from game_publishers gp where gp.game_id = g.id)
            order by g.name
            limit 5
        `, ['-tA']).split('\n').filter(Boolean)
        if (gameIds.length < 5) {
            gameIds = psql(databaseUrl, 'select id::text from games order by name limit 5', ['-tA']).split('\n').filter(Boolean)
        }
        marker = gameIds[0] ? psql(databaseUrl, `select name from games where id = '${gameIds[0]}'`, ['-tA']) : ''
    }
    const library = givePeekFive(gameIds, marker, 'igdb')
    log(`Local catalogue: ${stored} games. peek library marker: ${marker}`)
    return library
}

export function seedCatalogue() {
    if (!twitchReady()) {
        const missing = ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'].filter((name) => !process.env[name])
        log(`Missing ${missing.join(' and ')}. Seeding the fixture catalogue instead of IGDB.`)
        return seedFixture()
    }
    return seedIgdbTop()
}
