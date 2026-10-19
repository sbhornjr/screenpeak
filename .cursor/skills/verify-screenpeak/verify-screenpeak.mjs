#!/usr/bin/env node
// Local ScreenPeak verification harness. See SKILL.md in this directory.
import { spawn, spawnSync } from 'node:child_process'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { closeSync, existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { request as httpRequest } from 'node:http'
import { createConnection } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const runDir = '/tmp/screenpeak-verify'
const evidenceRoot = join(runDir, 'evidence')
const pidDir = join(runDir, 'pids')
const logDir = join(runDir, 'logs')
const statePath = join(runDir, 'state.json')
const envPath = join(root, 'apps/web/.env.local')
const envMarker = 'verify-screenpeak local stack'
const dbName = 'screenpeak_verify_copy'
const dbUser = 'screenpeak'
const dbPassword = 'screenpeak'
const authenticatorPassword = 'verify-authenticator'
const appPort = 3210
const gatewayPort = 54321
const postgrestPort = 54322
const peekEmail = 'hornflakes+peek@mail.grokbot.com'
const peekPassword = 'peekpeek'
const peekUsername = 'peek'
const adaEmail = 'hornflakes+ada@mail.grokbot.com'
const adaUsername = 'ada'
const resetEmail = 'hornflakes+reset@mail.grokbot.com'
const resetUsername = 'resetfan'
const resetOldPassword = 'local-old-1'
const resetNewPassword = 'local-new-1'
const expoPort = 8081
const catalogueTop = 100
const libraryPath = join(runDir, 'library.json')
const recoveryPath = join(runDir, 'recovery.json')
const signupPath = join(runDir, 'signups.json')
const signupEmail = 'hornflakes+signup@mail.grokbot.com'
const signupUsername = 'signupfan'
const signupPassword = 'local-signup-1'
const postgrestVersion = 'v16.4'
const postgrestUrl = `https://github.com/PostgREST/postgrest/releases/download/${postgrestVersion}/postgrest-${postgrestVersion}-linux-static-x86-64.tar.xz`

const databaseUrl = `postgresql://${dbUser}:${dbPassword}@127.0.0.1:5432/${dbName}`

function log(message) {
    console.log(message)
}

function fail(message) {
    console.error(message)
    process.exit(1)
}

async function readState() {
    try {
        return JSON.parse(await readFile(statePath, 'utf8'))
    } catch {
        return null
    }
}

async function writeState(state) {
    await mkdir(runDir, { recursive: true })
    await writeFile(statePath, JSON.stringify(state, null, 2))
}

function psql(url, sql, args = []) {
    const result = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-X', ...args], {
        input: sql,
        encoding: 'utf8',
    })
    if (result.status !== 0) {
        throw new Error((result.stderr || result.stdout || `psql exited ${result.status}`).trim())
    }
    return (result.stdout || '').trim()
}

function sudoPsql(sql) {
    const result = spawnSync('sudo', ['-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-X', '-d', 'postgres'], {
        input: sql,
        encoding: 'utf8',
    })
    if (result.status !== 0) {
        throw new Error((result.stderr || result.stdout || `sudo psql exited ${result.status}`).trim())
    }
    return (result.stdout || '').trim()
}

function portOpen(port) {
    return new Promise((resolve) => {
        const socket = createConnection({ port, host: '127.0.0.1' })
        const done = (open) => {
            socket.removeAllListeners()
            socket.destroy()
            resolve(open)
        }
        socket.once('connect', () => done(true))
        socket.once('error', () => done(false))
    })
}

function b64url(value) {
    return Buffer.from(value).toString('base64url')
}

function signJwt(payload, secret) {
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const body = b64url(JSON.stringify(payload))
    const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
    return `${header}.${body}.${signature}`
}

function verifyJwt(token, secret) {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, body, signature] = parts
    const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
    const actualBuf = Buffer.from(signature)
    const expectedBuf = Buffer.from(expected)
    if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
}

function userRecord(row) {
    const now = new Date().toISOString()
    return {
        id: row.id,
        aud: 'authenticated',
        role: 'authenticated',
        email: row.email,
        email_confirmed_at: now,
        confirmed_at: now,
        last_sign_in_at: now,
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: { username: row.username },
        identities: [{
            identity_id: row.id,
            id: row.id,
            user_id: row.id,
            identity_data: { email: row.email, sub: row.id },
            provider: 'email',
            last_sign_in_at: now,
            created_at: now,
            updated_at: now,
        }],
        created_at: now,
        updated_at: now,
        is_anonymous: false,
    }
}

function lookupPeek(email) {
    const line = psql(databaseUrl, `select u.id || '|' || u.email || '|' || p.username from auth.users u join public.users p on p.id = u.id where u.email = '${email.replaceAll("'", "''")}'`, ['-tA'])
    if (!line) return null
    const [id, foundEmail, username] = line.split('|')
    return { id, email: foundEmail, username }
}

function passwordMatches(userId, password) {
    const line = psql(databaseUrl, `select password from verify_local.passwords where user_id = '${userId}'`, ['-tA'])
    return line === password
}

function lookupUserById(userId) {
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return null
    const line = psql(databaseUrl, `select u.id || '|' || u.email || '|' || coalesce(p.username, '') from auth.users u left join public.users p on p.id = u.id where u.id = '${userId}'`, ['-tA'])
    if (!line) return null
    const [id, email, username] = line.split('|')
    return { id, email, username }
}

function pkceMatches(method, challenge, verifier) {
    if (!challenge || !verifier) return false
    if (method === 'plain') return verifier === challenge
    return createHash('sha256').update(verifier).digest('base64url') === challenge
}

function recordRecovery(entry) {
    let list = []
    try { list = JSON.parse(readFileSync(recoveryPath, 'utf8')) } catch { list = [] }
    list.push(entry)
    writeFileSync(recoveryPath, JSON.stringify(list, null, 2))
}

function recordSignup(entry) {
    let list = []
    try { list = JSON.parse(readFileSync(signupPath, 'utf8')) } catch { list = [] }
    list.push(entry)
    writeFileSync(signupPath, JSON.stringify(list, null, 2))
}

async function ensurePostgres() {
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

function applyMigrations() {
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

function applyLocalAppSql() {
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

function twitchReady() {
    return Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET)
}

function writeLibrary(library) {
    mkdirSyncSafe(runDir)
    writeFileSync(libraryPath, JSON.stringify(library, null, 2))
    return library
}

function readLibrary() {
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

function safeSeedLines(text) {
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

function seedCatalogue() {
    if (!twitchReady()) {
        const missing = ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'].filter((name) => !process.env[name])
        log(`Missing ${missing.join(' and ')}. Seeding the fixture catalogue instead of IGDB.`)
        return seedFixture()
    }
    return seedIgdbTop()
}

function readEnvFile() {
    if (!existsSync(envPath)) return null
    return readFileSync(envPath, 'utf8')
}

function writeEnv(secret) {
    const now = Math.floor(Date.now() / 1000)
    const anon = signJwt({ role: 'anon', iss: 'verify-screenpeak', iat: now, exp: now + 60 * 60 * 24 * 3650 }, secret)
    const existing = readEnvFile()
    if (existing && !existing.includes(envMarker)) {
        throw new Error(`Refusing to overwrite ${envPath}. It was not written by verify-screenpeak.`)
    }
    const r2FromEnv = process.env.R2_PUBLIC_URL
    const r2Substituted = !r2FromEnv
    const r2 = r2FromEnv || 'https://verify-screenpeak.invalid'
    const body = [
        `# ${envMarker}. Safe to delete. Local disposable database only.`,
        `LOCAL_DATABASE_URL=${databaseUrl}`,
        `DATABASE_URL=${databaseUrl}`,
        `DATABASE_POOL_URL=${databaseUrl}`,
        `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:${gatewayPort}`,
        `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}`,
        `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:${appPort}`,
        `R2_PUBLIC_URL=${r2}`,
        '',
    ].join('\n')
    writeFileSync(envPath, body)
    return { anon, r2Substituted, r2 }
}

async function ensurePostgrest() {
    const binary = join(runDir, 'postgrest', 'postgrest')
    if (existsSync(binary)) return binary
    await mkdir(join(runDir, 'postgrest'), { recursive: true })
    const archive = join(runDir, 'postgrest.tar.xz')
    const download = spawnSync('curl', ['-fL', '--retry', '3', '-o', archive, postgrestUrl], { encoding: 'utf8' })
    if (download.status !== 0) throw new Error(`Could not download PostgREST ${postgrestVersion}: ${download.stderr}`)
    const extract = spawnSync('tar', ['-xJf', archive, '-C', join(runDir, 'postgrest')], { encoding: 'utf8' })
    if (extract.status !== 0) throw new Error(extract.stderr || 'Could not extract PostgREST')
    return binary
}

function spawnLogged(name, command, args, env) {
    mkdirSyncSafe(logDir)
    mkdirSyncSafe(pidDir)
    const logPath = join(logDir, `${name}.log`)
    const fd = openSync(logPath, 'a')
    const child = spawn(command, args, {
        cwd: root,
        detached: true,
        stdio: ['ignore', fd, fd],
        env: { ...process.env, ...env },
    })
    closeSync(fd)
    child.unref()
    writeFileSync(join(pidDir, name), String(child.pid))
    return child.pid
}

function mkdirSyncSafe(path) {
    spawnSync('mkdir', ['-p', path])
}

function pidAlive(pid) {
    if (!pid) return false
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

function readPid(name) {
    try {
        return Number(readFileSync(join(pidDir, name), 'utf8').trim())
    } catch {
        return null
    }
}

function stopRecorded(name) {
    const pid = readPid(name)
    if (!pid) return
    try { process.kill(-pid, 'SIGTERM') } catch { /* already gone */ }
    try { process.kill(pid, 'SIGTERM') } catch { /* already gone */ }
    try { unlinkSyncSafe(join(pidDir, name)) } catch { /* ignore */ }
}

function unlinkSyncSafe(path) {
    spawnSync('rm', ['-f', path])
}

async function waitForHttp(url, timeoutMs) {
    const started = Date.now()
    let last = ''
    while (Date.now() - started < timeoutMs) {
        try {
            const response = await fetch(url)
            if (response.ok) return
            last = `${response.status}`
        } catch (error) {
            last = error instanceof Error ? error.message : String(error)
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
    }
    throw new Error(`Timed out waiting for ${url} (${last}). See ${logDir}.`)
}

function startGateway(secret) {
    const refreshTokens = new Map()
    const recoveryCodes = new Map()
    const unconfirmed = new Set()
    const signupTokens = new Map()
    const server = createServer(async (req, res) => {
        const originHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Expose-Headers': '*',
        }
        if (req.method === 'OPTIONS') {
            res.writeHead(204, originHeaders)
            res.end()
            return
        }
        const url = new URL(req.url || '/', `http://127.0.0.1:${gatewayPort}`)
        try {
            if (url.pathname === '/auth/v1/health') {
                sendJson(res, 200, { name: 'verify-screenpeak', version: '0' }, originHeaders)
                return
            }
            if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
                const body = await readBody(req)
                const grant = url.searchParams.get('grant_type')
                if (grant === 'password') {
                    const row = lookupPeek(String(body.email || '').trim())
                    if (!row || !passwordMatches(row.id, String(body.password || ''))) {
                        sendJson(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' }, originHeaders)
                        return
                    }
                    if (unconfirmed.has(row.id)) {
                        sendJson(res, 400, { error: 'email_not_confirmed', error_description: 'Email not confirmed', msg: 'Email not confirmed' }, originHeaders)
                        return
                    }
                    sendJson(res, 200, sessionFor(row, secret, refreshTokens), originHeaders)
                    return
                }
                if (grant === 'refresh_token') {
                    const userId = refreshTokens.get(body.refresh_token)
                    const row = userId && lookupUserById(userId)
                    if (!row) {
                        sendJson(res, 400, { error: 'invalid_grant', error_description: 'Invalid refresh token', msg: 'Invalid refresh token' }, originHeaders)
                        return
                    }
                    refreshTokens.delete(body.refresh_token)
                    sendJson(res, 200, sessionFor(row, secret, refreshTokens), originHeaders)
                    return
                }
                if (grant === 'pkce') {
                    const saved = recoveryCodes.get(String(body.auth_code || ''))
                    const verifier = String(body.code_verifier || '')
                    if (!saved || !pkceMatches(saved.method, saved.challenge, verifier)) {
                        sendJson(res, 400, { error: 'invalid_grant', error_description: 'Invalid code', msg: 'Invalid code' }, originHeaders)
                        return
                    }
                    recoveryCodes.delete(String(body.auth_code || ''))
                    const row = lookupUserById(saved.userId)
                    if (!row) {
                        sendJson(res, 400, { error: 'invalid_grant', msg: 'Invalid code' }, originHeaders)
                        return
                    }
                    sendJson(res, 200, sessionFor(row, secret, refreshTokens), originHeaders)
                    return
                }
                sendJson(res, 400, { error: 'unsupported_grant_type', msg: `Unsupported grant ${grant}` }, originHeaders)
                return
            }
            if (url.pathname === '/auth/v1/recover' && req.method === 'POST') {
                const body = await readBody(req)
                const email = String(body.email || '').trim()
                const redirectTo = url.searchParams.get('redirect_to') || ''
                const row = email ? lookupPeek(email) : null
                const code = row ? randomBytes(24).toString('hex') : null
                if (row && code) {
                    recoveryCodes.set(code, {
                        userId: row.id,
                        challenge: body.code_challenge || null,
                        method: body.code_challenge_method || 's256',
                    })
                }
                recordRecovery({
                    email,
                    code,
                    redirectTo,
                    challenge: body.code_challenge || null,
                    at: new Date().toISOString(),
                })
                sendJson(res, 200, {}, originHeaders)
                return
            }
            if (url.pathname === '/auth/v1/signup' && req.method === 'POST') {
                const body = await readBody(req)
                const email = String(body.email || '').trim()
                const password = String(body.password || '')
                const username = String(body.data && body.data.username || '').trim()
                if (!/^[A-Za-z0-9_]{3,20}$/.test(username) || !email || !password) {
                    sendJson(res, 400, { error: 'validation_failed', msg: 'Email, password, and username are required' }, originHeaders)
                    return
                }
                const safeEmail = email.replaceAll("'", "''")
                const safeUser = username.replaceAll("'", "''")
                const safePassword = password.replaceAll("'", "''")
                const existing = lookupPeek(email)
                if (existing) {
                    sendJson(res, 200, userRecord(existing), originHeaders)
                    return
                }
                psql(databaseUrl, `
                    INSERT INTO auth.users (id, email, raw_user_meta_data)
                    VALUES (gen_random_uuid(), '${safeEmail}', jsonb_build_object('username', '${safeUser}'));
                `)
                const id = psql(databaseUrl, `SELECT id FROM auth.users WHERE email = '${safeEmail}'`, ['-tA']).split('\n')[0].trim()
                if (!/^[0-9a-f-]{36}$/i.test(id)) {
                    sendJson(res, 500, { error: 'server_error', msg: 'Could not create the account.' }, originHeaders)
                    return
                }
                psql(databaseUrl, `
                    INSERT INTO verify_local.passwords (user_id, password)
                    VALUES ('${id}', '${safePassword}')
                    ON CONFLICT (user_id) DO UPDATE SET password = EXCLUDED.password;
                `)
                unconfirmed.add(id)
                const token = randomBytes(24).toString('hex')
                const challenge = body.code_challenge || null
                signupTokens.set(token, { userId: id, challenge })
                recordSignup({ email, username, token, challenge, at: new Date().toISOString() })
                const row = lookupUserById(id)
                sendJson(res, 200, userRecord(row), originHeaders)
                return
            }
            if (url.pathname === '/auth/v1/verify' && (req.method === 'GET' || req.method === 'POST')) {
                const token = url.searchParams.get('token') || ''
                const type = url.searchParams.get('type') || ''
                const saved = signupTokens.get(token)
                if (!saved || type !== 'signup') {
                    sendJson(res, 400, { error: 'invalid_token', msg: 'Invalid token' }, originHeaders)
                    return
                }
                if (saved.challenge) {
                    sendJson(res, 400, {
                        error: 'pkce_verifier_required',
                        msg: 'This confirmation needs the code verifier from the phone.',
                    }, originHeaders)
                    return
                }
                signupTokens.delete(token)
                unconfirmed.delete(saved.userId)
                sendJson(res, 200, {}, originHeaders)
                return
            }
            if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
                const token = bearer(req)
                const payload = token && verifyJwt(token, secret)
                const row = payload?.sub && lookupUserById(payload.sub)
                if (!row) {
                    sendJson(res, 401, { error: 'invalid_token', msg: 'Invalid token' }, originHeaders)
                    return
                }
                sendJson(res, 200, userRecord(row), originHeaders)
                return
            }
            if (url.pathname === '/auth/v1/user' && req.method === 'PUT') {
                const token = bearer(req)
                const payload = token && verifyJwt(token, secret)
                const row = payload?.sub && lookupUserById(payload.sub)
                if (!row) {
                    sendJson(res, 401, { error: 'invalid_token', msg: 'Invalid token' }, originHeaders)
                    return
                }
                const body = await readBody(req)
                if (typeof body.password === 'string' && body.password) {
                    const password = body.password.replaceAll("'", "''")
                    psql(databaseUrl, `
                        INSERT INTO verify_local.passwords (user_id, password)
                        VALUES ('${row.id}', '${password}')
                        ON CONFLICT (user_id) DO UPDATE SET password = EXCLUDED.password;
                    `)
                }
                sendJson(res, 200, userRecord(row), originHeaders)
                return
            }
            if (url.pathname === '/auth/v1/logout' && req.method === 'POST') {
                res.writeHead(204, originHeaders)
                res.end()
                return
            }
            if (url.pathname.startsWith('/rest/v1/')) {
                await proxyRest(req, res, url, originHeaders)
                return
            }
            sendJson(res, 404, { error: 'not_found', msg: `${req.method} ${url.pathname}` }, originHeaders)
        } catch (error) {
            sendJson(res, 500, { error: 'server_error', msg: error instanceof Error ? error.message : String(error) }, originHeaders)
        }
    })
    return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(gatewayPort, '127.0.0.1', () => resolve(server))
    })
}

function sessionFor(row, secret, refreshTokens) {
    const now = Math.floor(Date.now() / 1000)
    const accessToken = signJwt({
        aud: 'authenticated',
        role: 'authenticated',
        sub: row.id,
        email: row.email,
        iss: 'verify-screenpeak',
        iat: now,
        exp: now + 3600,
    }, secret)
    const refreshToken = randomBytes(24).toString('hex')
    refreshTokens.set(refreshToken, row.id)
    return {
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: now + 3600,
        refresh_token: refreshToken,
        user: userRecord(row),
    }
}

function bearer(req) {
    const header = req.headers.authorization || ''
    const match = header.match(/^Bearer\s+(.+)$/i)
    return match ? match[1] : ''
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = []
        req.on('data', (chunk) => chunks.push(chunk))
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString()
            if (!raw) return resolve({})
            try { resolve(JSON.parse(raw)) } catch (error) { reject(error) }
        })
        req.on('error', reject)
    })
}

function sendJson(res, status, body, extra) {
    const payload = JSON.stringify(body)
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...extra })
    res.end(payload)
}

function proxyRest(req, res, url, originHeaders) {
    const targetPath = url.pathname.replace(/^\/rest\/v1/, '') || '/'
    return new Promise((resolve, reject) => {
        const headers = { ...req.headers, host: `127.0.0.1:${postgrestPort}` }
        const proxy = httpRequest({
            host: '127.0.0.1',
            port: postgrestPort,
            method: req.method,
            path: `${targetPath}${url.search}`,
            headers,
        }, (upstream) => {
            const responseHeaders = { ...upstream.headers }
            delete responseHeaders['access-control-allow-origin']
            delete responseHeaders['access-control-expose-headers']
            delete responseHeaders['access-control-allow-headers']
            delete responseHeaders['access-control-allow-methods']
            Object.assign(responseHeaders, originHeaders)
            res.writeHead(upstream.statusCode || 502, responseHeaders)
            upstream.pipe(res)
            upstream.on('end', resolve)
        })
        proxy.on('error', reject)
        req.pipe(proxy)
    })
}

async function up() {
    await mkdir(runDir, { recursive: true })
    for (const port of [appPort, gatewayPort, postgrestPort]) {
        if (await portOpen(port)) fail(`Port ${port} is already in use. Refusing to start a second verification instance.`)
    }
    log('Ensuring local Postgres and screenpeak_verify_copy')
    await ensurePostgres()
    const secret = randomBytes(32).toString('hex')
    const envInfo = writeEnv(secret)
    log('Applying auth stubs (empty database only) and migrate:journal')
    applyMigrations()
    const authenticatorExisted = sudoPsql(`SELECT 1 FROM pg_roles WHERE rolname = 'authenticator'`).split('\n').some((line) => line.trim() === '1')
    log('Applying local auth.uid(), grants, and the peek account')
    applyLocalAppSql()
    const library = seedCatalogue()
    const postgrestBin = await ensurePostgrest()
    const postgrestPid = spawnLogged('postgrest', postgrestBin, [], {
        PGRST_DB_URI: `postgresql://authenticator:${authenticatorPassword}@127.0.0.1:5432/${dbName}`,
        PGRST_DB_SCHEMAS: 'public',
        PGRST_DB_ANON_ROLE: 'anon',
        PGRST_JWT_SECRET: secret,
        PGRST_SERVER_HOST: '127.0.0.1',
        PGRST_SERVER_PORT: String(postgrestPort),
    })
    await waitForHttp(`http://127.0.0.1:${postgrestPort}/`, 20_000)
    const gatewayPid = await forkGateway(secret)
    await waitForHttp(`http://127.0.0.1:${gatewayPort}/auth/v1/health`, 10_000)
    const nextPid = spawnLogged('next', 'npm', ['run', 'dev', '--', '-H', '127.0.0.1', '-p', String(appPort)], {})
    await waitForHttp(`http://127.0.0.1:${appPort}/`, 120_000)
    await writeState({
        secret,
        databaseUrl,
        app: `http://127.0.0.1:${appPort}`,
        r2Substituted: envInfo.r2Substituted,
        r2: envInfo.r2,
        createdAuthenticator: !authenticatorExisted,
        anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
        twitch: twitchReady(),
        catalogue: library.mode,
        marker: library.marker,
        pids: { postgrest: postgrestPid, gateway: gatewayPid, next: nextPid },
    })
    log(`ready http://127.0.0.1:${appPort}`)
    if (!process.env.ANTHROPIC_API_KEY) {
        log('ANTHROPIC_API_KEY is unset. The Read-out model call will fail closed. No stub is configured.')
    }
    if (envInfo.r2Substituted) {
        log('R2_PUBLIC_URL is unset. Substituted https://verify-screenpeak.invalid so next.config.ts can parse a hostname. The Read-out does not call R2.')
    }
    // PostgREST, the gateway, and Next are detached. Exit so an idle fetch
    // socket cannot keep this command from returning.
    process.exit(0)
}

async function forkGateway(secret) {
    const childPath = fileURLToPath(import.meta.url)
    return spawnLogged('gateway', process.execPath, [childPath, 'gateway'], {
        VERIFY_JWT_SECRET: secret,
        VERIFY_DATABASE_URL: databaseUrl,
    })
}

async function gatewayChild() {
    const secret = process.env.VERIFY_JWT_SECRET
    if (!secret) fail('VERIFY_JWT_SECRET is required for the gateway child.')
    await startGateway(secret)
    log(`gateway listening on ${gatewayPort}`)
}

async function doctor() {
    const state = await readState()
    const problems = []
    const lines = []
    function check(name, ok, detail) {
        lines.push(`${ok ? 'ok' : 'fail'} ${name}: ${detail}`)
        if (!ok) problems.push(name)
    }
    const nextPid = readPid('next')
    const gatewayPid = readPid('gateway')
    const postgrestPid = readPid('postgrest')
    check('next pid', pidAlive(nextPid), String(nextPid))
    check('gateway pid', pidAlive(gatewayPid), String(gatewayPid))
    check('postgrest pid', pidAlive(postgrestPid), String(postgrestPid))
    let home = ''
    try {
        const response = await fetch(`http://127.0.0.1:${appPort}/`)
        home = await response.text()
        check('home', response.status === 200 && home.includes('ScreenPeak'), `status ${response.status}`)
    } catch (error) {
        check('home', false, error instanceof Error ? error.message : String(error))
    }
    try {
        const health = await fetch(`http://127.0.0.1:${gatewayPort}/auth/v1/health`)
        check('auth health', health.ok, `status ${health.status}`)
    } catch (error) {
        check('auth health', false, error instanceof Error ? error.message : String(error))
    }
    try {
        const rest = await fetch(`http://127.0.0.1:${postgrestPort}/`)
        check('postgrest', rest.ok, `status ${rest.status}`)
    } catch (error) {
        check('postgrest', false, error instanceof Error ? error.message : String(error))
    }
    const parsed = new URL(databaseUrl)
    check('database host', ['127.0.0.1', 'localhost'].includes(parsed.hostname), parsed.hostname)
    check('database name', parsed.pathname === `/${dbName}`, parsed.pathname)
    try {
        const counts = psql(databaseUrl, `
            select u.username || ' ratings=' || count(rr.id) || ' library=' || (
                select count(*) from library_entries le where le.user_id = u.id
            )
            from users u
            left join ratings_reviews rr on rr.user_id = u.id
            where u.username = '${peekUsername}'
            group by u.id, u.username
        `, ['-tA'])
        check('library', counts.startsWith('peek ratings=5 library=5'), counts || 'missing peek')
    } catch (error) {
        check('library', false, error instanceof Error ? error.message : String(error))
    }
    const chrome = spawnSync('google-chrome', ['--version'], { encoding: 'utf8' })
    check('chrome', chrome.status === 0, (chrome.stdout || chrome.stderr || '').trim())
    lines.push(`info catalogue: ${state?.catalogue || 'unknown'} marker=${state?.marker || 'unknown'}`)
    lines.push(`info ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'set' : 'unset'}`)
    lines.push(`info TWITCH_CLIENT_ID: ${process.env.TWITCH_CLIENT_ID ? 'set' : 'unset'}`)
    lines.push(`info TWITCH_CLIENT_SECRET: ${process.env.TWITCH_CLIENT_SECRET ? 'set' : 'unset'}`)
    lines.push(`info R2_PUBLIC_URL: ${state?.r2Substituted ? `unset; substituted ${state.r2}` : (state?.r2 || 'unknown')}`)
    lines.push(`info app: http://127.0.0.1:${appPort}`)
    const text = lines.join('\n')
    await mkdir(evidenceRoot, { recursive: true })
    await writeFile(join(evidenceRoot, 'doctor.txt'), text + '\n')
    console.log(text)
    if (problems.length) process.exit(1)
}

function resetReadout() {
    psql(databaseUrl, `
        UPDATE users
        SET loadout_identity = NULL, loadout_identity_at = NULL, profile_loadout_bio = NULL
        WHERE username = '${peekUsername}';
    `)
}

function readoutRow() {
    return psql(databaseUrl, `
        select 'username=' || username
            || E'\\nloadout_identity=' || coalesce(loadout_identity, '<null>')
            || E'\\nloadout_identity_at=' || coalesce(loadout_identity_at::text, '<null>')
            || E'\\nratings=' || (select count(*) from ratings_reviews rr where rr.user_id = users.id)
            || E'\\nlibrary=' || (select count(*) from library_entries le where le.user_id = users.id)
        from users where username = '${peekUsername}';
    `, ['-tA'])
}

function ratedGame() {
    const line = psql(databaseUrl, `
        select g.slug || '|' || g.name || '|' || coalesce(g.cover_image_url, '')
        from games g
        join ratings_reviews rr on rr.game_id = g.id
        join users u on u.id = rr.user_id
        where u.username = '${peekUsername}'
        order by g.slug
        limit 1
    `, ['-tA'])
    if (!line) throw new Error('peek has no rated game to open.')
    const [slug, name, cover] = line.split('|')
    return { slug, name, cover: cover || null }
}

async function driveGamePage() {
    const doctorRun = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'doctor'], { encoding: 'utf8' })
    process.stdout.write(doctorRun.stdout || '')
    if (doctorRun.status !== 0) fail('Doctor failed. Not driving.')
    const game = ratedGame()
    const dir = join(evidenceRoot, 'game-page')
    await mkdir(dir, { recursive: true })
    const gameUrl = `http://127.0.0.1:${appPort}/api/v1/games/${encodeURIComponent(game.slug)}`
    const reviewsUrl = `${gameUrl}/reviews`
    const gameRes = await fetch(gameUrl)
    const gameBody = await gameRes.json()
    const reviewsRes = await fetch(reviewsUrl)
    const reviewsBody = await reviewsRes.json()
    const payload = JSON.stringify(gameBody)
    const cover = gameBody?.game?.cover_image_url ?? null
    const problems = []
    if (gameRes.status !== 200) problems.push(`game status ${gameRes.status}`)
    if (gameBody?.game?.name !== game.name) problems.push(`name ${gameBody?.game?.name} != ${game.name}`)
    if (gameBody?.game?.slug !== game.slug) problems.push(`slug ${gameBody?.game?.slug}`)
    if (gameBody?.viewer !== null) problems.push('viewer was not null')
    if (typeof gameBody?.stats?.avg_rating !== 'number') problems.push(`avg_rating ${gameBody?.stats?.avg_rating}`)
    if (payload.includes('steam_appid') || payload.includes('metacritic') || payload.includes('avg_ngplus_rating')) {
        problems.push('payload includes a retired field')
    }
    if (game.cover && (!cover || !cover.includes('/t_cover_big_2x/') || !cover.startsWith('https://images.igdb.com/'))) {
        problems.push(`cover was not a display URL: ${cover}`)
    }
    if (!game.cover && cover !== null) problems.push(`cover should be null, got ${cover}`)
    if (reviewsRes.status !== 200 || !Array.isArray(reviewsBody?.reviews)) problems.push(`reviews status ${reviewsRes.status}`)
    const chromePid = await launchChrome()
    let page = null
    try {
        page = await connectChrome()
        await page.navigate(`http://127.0.0.1:${appPort}/games/${encodeURIComponent(game.slug)}`)
        await page.waitForText(game.name)
        await page.screenshot(join(dir, 'page.png'))
        const bodyText = await page.bodyText()
        if (!bodyText.includes(game.name)) problems.push('the page text does not include the game name')
    } finally {
        page?.close()
        stopRecorded('chrome')
        if (chromePid) {
            try { process.kill(chromePid, 'SIGTERM') } catch { /* already stopped */ }
        }
    }
    const result = {
        feature: 'game-page',
        slug: game.slug,
        name: game.name,
        storedCover: game.cover,
        apiStatus: gameRes.status,
        viewer: gameBody?.viewer ?? null,
        avg_rating: gameBody?.stats?.avg_rating ?? null,
        cover_image_url: cover,
        reviewsStatus: reviewsRes.status,
        reviewCount: Array.isArray(reviewsBody?.reviews) ? reviewsBody.reviews.length : null,
        problems,
    }
    await writeFile(join(dir, 'result.json'), JSON.stringify(result, null, 2))
    if (problems.length) {
        console.error(problems.join('\n'))
        process.exit(1)
    }
    log(`proved game-page evidence ${dir}`)
}

function restorePeekPrivacy() {
    psql(databaseUrl, `
        UPDATE users
        SET library_public = true, loadout_public = true
        WHERE username = '${peekUsername}';
        DELETE FROM lists
        WHERE user_id = (SELECT id FROM users WHERE username = '${peekUsername}')
          AND name = 'Verify Private Shelf';
    `)
}

async function driveReadEndpoints() {
    const doctorRun = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'doctor'], { encoding: 'utf8' })
    process.stdout.write(doctorRun.stdout || '')
    if (doctorRun.status !== 0) fail('Doctor failed. Not driving.')
    const dir = join(evidenceRoot, 'read-endpoints')
    await mkdir(dir, { recursive: true })
    const origin = `http://127.0.0.1:${appPort}`
    const problems = []
    const record = {}

    async function getJson(path) {
        const res = await fetch(`${origin}${path}`)
        const body = await res.json().catch(() => null)
        return { status: res.status, body }
    }

    restorePeekPrivacy()
    try {
        const profile = await getJson(`/api/v1/user/${peekUsername}`)
        record.profileStatus = profile.status
        const profileText = JSON.stringify(profile.body)
        if (profile.status !== 200) problems.push(`profile status ${profile.status}`)
        if (typeof profile.body?.profile?.follower_count !== 'number') problems.push('follower_count is not a number')
        if (typeof profile.body?.profile?.following_count !== 'number') problems.push('following_count is not a number')
        if (profile.body?.viewer !== null) problems.push('profile viewer was not null')
        if (profile.body?.profile?.email != null) problems.push('profile included an email')
        if (profileText.includes('follower_id') || Array.isArray(profile.body?.followers) || Array.isArray(profile.body?.following)) {
            problems.push('profile included a follower list')
        }
        if (profile.body?.library_stats == null) problems.push('public library_stats was missing')

        const library = await getJson(`/api/v1/user/${peekUsername}/library`)
        record.libraryStatus = library.status
        const publicGame = library.body?.games?.[0]?.name ?? null
        record.publicGame = publicGame
        if (library.status !== 200 || !Array.isArray(library.body?.games) || library.body.games.length < 1) {
            problems.push(`public library status ${library.status}`)
        }
        if (JSON.stringify(library.body).includes('avg_ngplus_rating') || JSON.stringify(library.body).includes('steam_appid')) {
            problems.push('library payload includes a retired field')
        }

        psql(databaseUrl, `UPDATE users SET library_public = false WHERE username = '${peekUsername}';`)
        const hiddenLibrary = await getJson(`/api/v1/user/${peekUsername}/library`)
        record.privateLibraryStatus = hiddenLibrary.status
        const hiddenLibraryText = JSON.stringify(hiddenLibrary.body)
        if (hiddenLibrary.status !== 404) problems.push(`private library status ${hiddenLibrary.status}`)
        if (hiddenLibrary.body?.error?.message !== 'Not found.') problems.push('private library was distinguishable from a missing player')
        if (publicGame && hiddenLibraryText.includes(publicGame)) problems.push('private library leaked a game name')
        psql(databaseUrl, `UPDATE users SET library_public = true WHERE username = '${peekUsername}';`)

        const loadout = await getJson(`/api/v1/user/${peekUsername}/loadout`)
        record.loadoutStatus = loadout.status
        if (loadout.status !== 200 || typeof loadout.body?.rating_count !== 'number') problems.push(`public loadout status ${loadout.status}`)
        if (loadout.body?.viewer !== null) problems.push('loadout viewer was not null')

        psql(databaseUrl, `UPDATE users SET loadout_public = false WHERE username = '${peekUsername}';`)
        const hiddenLoadout = await getJson(`/api/v1/user/${peekUsername}/loadout`)
        record.privateLoadoutStatus = hiddenLoadout.status
        if (hiddenLoadout.status !== 404 || hiddenLoadout.body?.error?.message !== 'Not found.') {
            problems.push(`private loadout status ${hiddenLoadout.status}`)
        }
        if (JSON.stringify(hiddenLoadout.body).includes('identity') && hiddenLoadout.body?.identity) {
            problems.push('private loadout leaked identity')
        }
        psql(databaseUrl, `UPDATE users SET loadout_public = true WHERE username = '${peekUsername}';`)

        const inserted = psql(databaseUrl, `
            INSERT INTO lists (user_id, name, description, is_public, is_default)
            SELECT id, 'Verify Private Shelf', 'kept off the index', false, false
            FROM users WHERE username = '${peekUsername}'
            RETURNING id::text;
        `, ['-t', '-A'])
        const listId = inserted.split(/\s+/).find(part => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part))
        record.privateListId = listId ?? inserted
        if (!listId) problems.push('could not read the private list id')
        const lists = await getJson(`/api/v1/user/${peekUsername}/lists`)
        record.listsStatus = lists.status
        const names = Array.isArray(lists.body?.lists) ? lists.body.lists.map(row => row.name) : []
        if (lists.status !== 200) problems.push(`lists status ${lists.status}`)
        if (names.includes('Verify Private Shelf')) problems.push('private list appeared on the index')
        const detail = await getJson(`/api/v1/user/${peekUsername}/lists/${encodeURIComponent(listId)}`)
        record.privateListStatus = detail.status
        if (detail.status !== 404 || detail.body?.error?.message !== 'Not found.') {
            problems.push(`private list detail status ${detail.status}`)
        }
        if (JSON.stringify(detail.body).includes('Verify Private Shelf')) problems.push('private list detail leaked the name')

        const catalogue = await getJson('/api/v1/games')
        record.gamesStatus = catalogue.status
        const catalogueText = JSON.stringify(catalogue.body)
        if (catalogue.status !== 200 || !Array.isArray(catalogue.body?.games) || catalogue.body.games.length < 1) {
            problems.push(`games status ${catalogue.status}`)
        }
        if (catalogueText.includes('avg_ngplus_rating')) problems.push('games payload still uses avg_ngplus_rating')
        if (Array.isArray(catalogue.body?.games) && catalogue.body.games.some(game => !('avg_rating' in game))) {
            problems.push('a catalogue card is missing avg_rating')
        }

        const me = await getJson('/api/v1/me')
        record.meStatus = me.status
        if (me.status !== 200 || me.body?.user !== null) problems.push(`me status ${me.status}`)
        const settings = await getJson('/api/v1/me/settings')
        record.settingsStatus = settings.status
        if (settings.status !== 401 || settings.body?.error?.code !== 'unauthenticated') {
            problems.push(`settings status ${settings.status}`)
        }

        const chromePid = await launchChrome()
        let page = null
        try {
            page = await connectChrome()
            await page.navigate(`${origin}/user/${peekUsername}`)
            await page.waitForText('Followers')
            await page.screenshot(join(dir, 'page.png'))
            const bodyText = await page.bodyText()
            if (!bodyText.includes(peekUsername)) problems.push('the profile page text does not include peek')
        } finally {
            page?.close()
            stopRecorded('chrome')
            if (chromePid) {
                try { process.kill(chromePid, 'SIGTERM') } catch { /* already stopped */ }
            }
        }
    } finally {
        restorePeekPrivacy()
    }

    const result = { feature: 'read-endpoints', ...record, problems }
    await writeFile(join(dir, 'result.json'), JSON.stringify(result, null, 2))
    if (problems.length) {
        console.error(problems.join('\n'))
        process.exit(1)
    }
    log(`proved read-endpoints evidence ${dir}`)
}

function assertUuid(value, label) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        throw new Error(`${label} is not a uuid: ${value}`)
    }
    return value
}

function peekWriteTarget() {
    const line = psql(databaseUrl, `
        select g.id::text || '|' || g.slug || '|' || g.name || '|' || rr.rating::text
            || '|' || encode(convert_to(coalesce(rr.review, ''), 'UTF8'), 'base64')
            || '|' || le.status
            || '|' || coalesce(le.hours_played::text, '')
            || '|' || coalesce(le.play_count::text, '')
            || '|' || coalesce(le.completed_all_achievements::text, '')
            || '|' || u.id::text
        from games g
        join ratings_reviews rr on rr.game_id = g.id
        join library_entries le on le.game_id = g.id and le.user_id = rr.user_id
        join users u on u.id = rr.user_id
        where u.username = '${peekUsername}'
        order by g.slug
        limit 1
    `, ['-tA'])
    if (!line) throw new Error('peek has no rated library game to write.')
    const [gameId, slug, name, rating, reviewB64, status, hours, playCount, completed, userId] = line.split('|')
    const allowed = ['playing', 'completed', 'backlog', 'abandoned']
    if (!allowed.includes(status)) throw new Error(`unexpected library status ${status}`)
    return {
        gameId: assertUuid(gameId, 'gameId'),
        slug,
        name,
        rating: Number(rating),
        reviewB64,
        status,
        hours,
        playCount,
        completed,
        userId: assertUuid(userId, 'userId'),
    }
}

function peekCounts() {
    const line = psql(databaseUrl, `
        select (select count(*) from ratings_reviews rr join users u on u.id = rr.user_id where u.username = '${peekUsername}')
            || '|' ||
            (select count(*) from library_entries le join users u on u.id = le.user_id where u.username = '${peekUsername}')
    `, ['-tA'])
    const [ratings, library] = line.split('|').map(Number)
    return { ratings, library }
}

function restorePeekWrites(target) {
    const completed = target.completed === '' ? 'null' : target.completed === 't' || target.completed === 'true' ? 'true' : 'false'
    psql(databaseUrl, `
        update ratings_reviews
        set rating = ${target.rating},
            review = convert_from(decode('${target.reviewB64}', 'base64'), 'UTF8')
        where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid;
        update library_entries
        set status = '${target.status}',
            hours_played = ${target.hours === '' ? 'null' : target.hours},
            play_count = ${target.playCount === '' ? 'null' : target.playCount},
            completed_all_achievements = ${completed}
        where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid;
    `)
}

async function peekAccessToken() {
    const res = await fetch(`http://127.0.0.1:${gatewayPort}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: 'verify-screenpeak' },
        body: JSON.stringify({ email: peekEmail, password: peekPassword }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok || !body?.access_token) throw new Error(`password grant failed (${res.status})`)
    return body.access_token
}

async function driveGameWrites() {
    const doctorRun = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'doctor'], { encoding: 'utf8' })
    process.stdout.write(doctorRun.stdout || '')
    if (doctorRun.status !== 0) fail('Doctor failed. Not driving.')
    const target = peekWriteTarget()
    const beforeCounts = peekCounts()
    const dir = join(evidenceRoot, 'game-writes')
    await mkdir(dir, { recursive: true })
    const origin = `http://127.0.0.1:${appPort}`
    const problems = []
    const record = {
        feature: 'game-writes',
        slug: target.slug,
        name: target.name,
        gameId: target.gameId,
        countsBefore: beforeCounts,
    }
    const nextStatus = target.status === 'playing' ? 'backlog' : 'playing'
    const marker = 'verify-screenpeak write'
    let token = ''
    let createdListId = ''
    try {
        token = await peekAccessToken()
        const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }

        const denied = await fetch(`${origin}/api/v1/games/${target.gameId}/review`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ rating: target.rating, review: marker }),
        })
        const deniedBody = await denied.json().catch(() => null)
        record.noTokenStatus = denied.status
        record.noTokenCode = deniedBody?.error?.code ?? null
        if (denied.status !== 401 || deniedBody?.error?.code !== 'unauthenticated') {
            problems.push(`missing bearer status ${denied.status} ${deniedBody?.error?.code}`)
        }

        const cookieOnly = await fetch(`${origin}/api/v1/games/${target.gameId}/review`, {
            method: 'PUT',
            headers: {
                Cookie: 'sb-access-token=website-session',
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({ rating: target.rating, review: marker }),
        })
        const cookieBody = await cookieOnly.json().catch(() => null)
        record.cookieOnlyStatus = cookieOnly.status
        record.cookieOnlyCode = cookieBody?.error?.code ?? null
        if (cookieOnly.status !== 401 || cookieBody?.error?.code !== 'unauthenticated') {
            problems.push(`cookie-only status ${cookieOnly.status} ${cookieBody?.error?.code}`)
        }

        const reviewRes = await fetch(`${origin}/api/v1/games/${target.gameId}/review`, {
            method: 'PUT',
            headers: auth,
            body: JSON.stringify({ rating: target.rating, review: marker }),
        })
        const reviewBody = await reviewRes.json().catch(() => null)
        record.reviewStatus = reviewRes.status
        if (reviewRes.status !== 200) problems.push(`review status ${reviewRes.status}`)
        if (reviewBody?.review !== marker) problems.push(`review body ${reviewBody?.review}`)
        if (reviewBody?.user_id !== target.userId) problems.push('review user_id was not peek')
        const reviewRow = psql(databaseUrl, `
            select review from ratings_reviews
            where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
        `, ['-tA'])
        record.reviewInPostgres = reviewRow
        if (reviewRow !== marker) problems.push(`postgres review ${reviewRow}`)

        psql(databaseUrl, `
            update library_entries
            set hours_played = 12.5, play_count = 4, completed_all_achievements = true
            where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
        `)
        const libraryRes = await fetch(`${origin}/api/v1/me/library/${target.gameId}`, {
            method: 'PUT',
            headers: auth,
            body: JSON.stringify({ status: nextStatus }),
        })
        const libraryBody = await libraryRes.json().catch(() => null)
        record.libraryStatus = libraryRes.status
        record.libraryBodyStatus = libraryBody?.status ?? null
        if (libraryRes.status !== 200 || libraryBody?.status !== nextStatus) {
            problems.push(`library status ${libraryRes.status} ${libraryBody?.status}`)
        }
        const libraryRow = psql(databaseUrl, `
            select status from library_entries
            where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
        `, ['-tA'])
        record.libraryInPostgres = libraryRow
        if (libraryRow !== nextStatus) problems.push(`postgres library ${libraryRow}`)
        const kept = psql(databaseUrl, `
            select coalesce(hours_played::text, '') || '|' || coalesce(play_count::text, '') || '|' || coalesce(completed_all_achievements::text, '')
            from library_entries
            where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
        `, ['-tA'])
        record.libraryDetailsKept = kept
        const [keptHours, keptPlays, keptComplete] = (kept || '').split('|')
        if (Number(keptHours) !== 12.5 || keptPlays !== '4' || (keptComplete !== 't' && keptComplete !== 'true')) {
            problems.push(`status-only save changed library details ${kept}`)
        }

        const listRes = await fetch(`${origin}/api/v1/lists`, {
            method: 'POST',
            headers: auth,
            body: JSON.stringify({
                name: 'Verify Write Shelf',
                description: 'harness',
                isPublic: false,
                isPinned: false,
                gameId: target.gameId,
            }),
        })
        const listBody = await listRes.json().catch(() => null)
        record.listStatus = listRes.status
        record.listId = listBody?.id ?? null
        createdListId = listBody?.id ?? ''
        if (listRes.status !== 201 || !listBody?.id) problems.push(`list status ${listRes.status}`)
        else assertUuid(listBody.id, 'listId')
        if (listBody?.id) {
            const membership = psql(databaseUrl, `
                select count(*) from list_games
                where list_id = '${listBody.id}'::uuid and game_id = '${target.gameId}'::uuid
            `, ['-tA'])
            record.listGameCount = Number(membership)
            if (membership !== '1') problems.push(`list_games count ${membership}`)
        }

        const self = await fetch(`${origin}/api/v1/user/${target.userId}/follow`, {
            method: 'POST',
            headers: auth,
        })
        const selfBody = await self.json().catch(() => null)
        record.selfFollowStatus = self.status
        if (self.status !== 400 || selfBody?.error?.message !== 'You cannot follow yourself.') {
            problems.push(`self-follow status ${self.status}`)
        }

        const during = peekCounts()
        record.countsDuring = during
        if (during.ratings !== beforeCounts.ratings || during.library !== beforeCounts.library) {
            problems.push(`counts changed during writes ${during.ratings}/${during.library}`)
        }
    } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error))
    } finally {
        if (createdListId && token) {
            try {
                const del = await fetch(`${origin}/api/v1/lists/${createdListId}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
                })
                record.listDeleteStatus = del.status
                if (del.status !== 204) problems.push(`list delete status ${del.status}`)
            } catch (error) {
                problems.push(error instanceof Error ? error.message : String(error))
            }
        }
        restorePeekWrites(target)
        if (record.listDeleteStatus !== 204) {
            psql(databaseUrl, `
                delete from lists
                where user_id = '${target.userId}'::uuid and name = 'Verify Write Shelf';
            `)
        }
    }

    const after = peekCounts()
    record.countsAfter = after
    if (after.ratings !== 5 || after.library !== 5) problems.push(`counts after restore ${after.ratings}/${after.library}`)
    const leftover = psql(databaseUrl, `
        select count(*) from lists
        where user_id = '${target.userId}'::uuid and name = 'Verify Write Shelf'
    `, ['-tA'])
    record.leftoverLists = Number(leftover)
    if (leftover !== '0') problems.push('Verify Write Shelf was not deleted')
    const restoredReview = psql(databaseUrl, `
        select rating::text || '|' || encode(convert_to(coalesce(review, ''), 'UTF8'), 'base64') || '|' || (
            select status from library_entries
            where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
        )
        from ratings_reviews
        where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
    `, ['-tA'])
    record.restored = restoredReview
    if (restoredReview !== `${target.rating}|${target.reviewB64}|${target.status}`) {
        problems.push(`restore mismatch ${restoredReview}`)
    }

    const chromePid = await launchChrome()
    let page = null
    try {
        page = await connectChrome()
        await page.navigate(`${origin}/games/${encodeURIComponent(target.slug)}`)
        await page.waitForText(target.name)
        await page.screenshot(join(dir, 'page.png'))
        const bodyText = await page.bodyText()
        if (!bodyText.includes(target.name)) problems.push('the page text does not include the game name')
    } finally {
        page?.close()
        stopRecorded('chrome')
        if (chromePid) {
            try { process.kill(chromePid, 'SIGTERM') } catch { /* already stopped */ }
        }
    }

    record.problems = problems
    await writeFile(join(dir, 'result.json'), JSON.stringify(record, null, 2))
    await writeFile(join(dir, 'postgres.txt'), [
        `slug=${target.slug}`,
        `review_during=${record.reviewInPostgres ?? ''}`,
        `library_during=${record.libraryInPostgres ?? ''}`,
        `list_games=${record.listGameCount ?? ''}`,
        `counts_before=${beforeCounts.ratings}/${beforeCounts.library}`,
        `counts_after=${after.ratings}/${after.library}`,
        `restored=${restoredReview}`,
        '',
    ].join('\n'))
    if (problems.length) {
        console.error(problems.join('\n'))
        process.exit(1)
    }
    log(`proved game-writes evidence ${dir}`)
}

function searchTarget() {
    const line = psql(databaseUrl, `
        select g.name || chr(31) || d.name || chr(31) || p.name || chr(31) || coalesce(g.cover_image_url, '')
        from games g
        join ratings_reviews rr on rr.game_id = g.id
        join users u on u.id = rr.user_id
        join game_developers gd on gd.game_id = g.id
        join developers d on d.id = gd.developer_id
        join game_publishers gp on gp.game_id = g.id
        join publishers p on p.id = gp.publisher_id
        where u.username = '${peekUsername}'
        order by g.slug
        limit 1
    `, ['-tA'])
    if (!line) throw new Error('peek has no rated game with a developer and a publisher to search.')
    const [name, developer, publisher, cover] = line.split('\x1f')
    if (!name || !developer || !publisher) throw new Error(`search target was incomplete: ${line}`)
    return { name, developer, publisher, cover: cover || null }
}

async function driveSearch() {
    const doctorRun = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'doctor'], { encoding: 'utf8' })
    process.stdout.write(doctorRun.stdout || '')
    if (doctorRun.status !== 0) fail('Doctor failed. Not driving.')
    const target = searchTarget()
    const dir = join(evidenceRoot, 'search')
    await mkdir(dir, { recursive: true })
    const origin = `http://127.0.0.1:${appPort}`
    const problems = []
    const record = {
        feature: 'search',
        name: target.name,
        developer: target.developer,
        publisher: target.publisher,
        storedCover: target.cover,
    }

    async function getJson(path, headers = {}) {
        const res = await fetch(`${origin}${path}`, { headers })
        const body = await res.json().catch(() => null)
        return { status: res.status, body, cache: res.headers.get('cache-control') }
    }

    const gamePath = `/api/v1/games/search?q=${encodeURIComponent(target.name)}`
    const found = await getJson(gamePath)
    record.gameStatus = found.status
    const payload = JSON.stringify(found.body)
    const hit = Array.isArray(found.body?.games)
        ? found.body.games.find(game => game.name === target.name)
        : null
    if (found.status !== 200) problems.push(`game search status ${found.status}`)
    if (!hit) problems.push(`game search missed ${target.name}`)
    else {
        try { assertUuid(hit.id, 'game id') } catch (error) {
            problems.push(error instanceof Error ? error.message : String(error))
        }
        record.avg_rating = hit.avg_rating
        record.cover_image_url = hit.cover_image_url
        if (typeof hit.avg_rating !== 'number') problems.push(`avg_rating ${hit.avg_rating}`)
    }
    if (payload.includes('avg_ngplus_rating')) problems.push('game search included avg_ngplus_rating')
    if (found.cache !== 'private, no-store') problems.push(`cache ${found.cache}`)
    if (target.cover && target.cover.includes('images.igdb.com')) {
        const cover = hit?.cover_image_url ?? ''
        if (!String(cover).includes('/t_cover_big_2x/')) problems.push(`cover was not a display URL: ${cover}`)
    } else if (hit && hit.cover_image_url !== null) {
        problems.push(`cover should be null, got ${hit.cover_image_url}`)
    }

    const empty = await getJson('/api/v1/games/search?q=')
    record.emptyStatus = empty.status
    record.emptyCode = empty.body?.error?.code ?? null
    if (empty.status !== 400 || empty.body?.error?.code !== 'invalid_request') {
        problems.push(`empty query status ${empty.status} ${empty.body?.error?.code}`)
    }
    const capped = await getJson(`${gamePath}&limit=21`)
    record.limitStatus = capped.status
    if (capped.status !== 400 || capped.body?.error?.code !== 'invalid_request') {
        problems.push(`limit=21 status ${capped.status}`)
    }

    const taxonomy = await getJson(`/api/v1/taxonomy/developers/search?q=${encodeURIComponent(target.developer)}`)
    record.taxonomyStatus = taxonomy.status
    const developerHit = Array.isArray(taxonomy.body?.results)
        ? taxonomy.body.results.find(row => row.name === target.developer)
        : null
    if (taxonomy.status !== 200 || !developerHit) problems.push(`developer search status ${taxonomy.status}`)
    else {
        try { assertUuid(developerHit.id, 'developer id') } catch (error) {
            problems.push(error instanceof Error ? error.message : String(error))
        }
    }
    const publishers = await getJson(`/api/v1/taxonomy/publishers/search?q=${encodeURIComponent(target.publisher)}`)
    record.publisherStatus = publishers.status
    const publisherHit = Array.isArray(publishers.body?.results)
        ? publishers.body.results.find(row => row.name === target.publisher)
        : null
    if (publishers.status !== 200 || !publisherHit) problems.push(`publisher search status ${publishers.status}`)
    else {
        try { assertUuid(publisherHit.id, 'publisher id') } catch (error) {
            problems.push(error instanceof Error ? error.message : String(error))
        }
    }
    const genres = await getJson('/api/v1/taxonomy/genres/search?q=a')
    record.genresStatus = genres.status
    if (genres.status !== 400 || genres.body?.error?.code !== 'invalid_request') {
        problems.push(`genres status ${genres.status}`)
    }

    const cookieOnly = await getJson(gamePath, { Cookie: 'sb-access-token=website-session' })
    record.cookieOnlyStatus = cookieOnly.status
    if (cookieOnly.status !== 200) problems.push(`cookie-only status ${cookieOnly.status}`)
    const badBearer = await getJson(gamePath, { Authorization: 'Bearer not-a-token' })
    record.badBearerStatus = badBearer.status
    record.badBearerCode = badBearer.body?.error?.code ?? null
    if (badBearer.status !== 401 || badBearer.body?.error?.code !== 'invalid_token') {
        problems.push(`bad bearer status ${badBearer.status} ${badBearer.body?.error?.code}`)
    }

    let chromePid = null
    let page = null
    try {
        chromePid = await launchChrome()
        page = await connectChrome()
        try {
        await page.navigate(`${origin}/games`)
        await page.clickButton('+ Filters')
        await page.waitForText('- Filters')
        await page.clickPlaceholder('All Developers')
        await page.fillPlaceholder('All Developers', target.developer)
        await page.waitUntil(`(() => {
            const hit = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === ${JSON.stringify(target.developer)} && item.className.includes('text-left'))
            return hit ? 'ok' : 'no-result'
        })()`)
        await page.screenshot(join(dir, 'filters.png'))
        const filtersText = await page.bodyText()
        if (!filtersText.includes(target.developer)) problems.push('the filters page does not include the developer')

        await page.clickButton('Sign In')
        await page.waitForText('Password')
        await page.fillPlaceholder('Email', peekEmail)
        await page.fillPlaceholder('Password', peekPassword)
        await page.clickDialogButton('Sign In')
        await page.waitForText(peekUsername)
        await page.navigate(`${origin}/user/${peekUsername}`)
        await page.waitForText('FAVORITE GAMES')
        await page.clickSectionButton('Favorite Games')
        await page.waitForText('CHOOSE FAVORITE GAMES')
        await page.fillPlaceholder('Search games...', target.name)
        await page.waitUntil(`(() => {
            const dialog = document.querySelector('[role="dialog"]')
            if (!dialog) return 'no-dialog'
            const heading = [...dialog.querySelectorAll('h3')].find((item) => item.textContent.trim() === ${JSON.stringify(target.name)})
            return heading ? 'ok' : 'no-result'
        })()`)
        await page.screenshot(join(dir, 'favorites.png'))
        const dialogText = await page.bodyText()
        if (!dialogText.includes('CHOOSE FAVORITE GAMES') || !dialogText.toUpperCase().includes(target.name.toUpperCase())) {
            problems.push('the favorite picker does not include the game')
        }
        } catch (error) {
            problems.push(error instanceof Error ? error.message : String(error))
            try { await page.screenshot(join(dir, 'failed.png')) } catch { /* the page may already be gone */ }
        }
    } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error))
    } finally {
        page?.close()
        stopRecorded('chrome')
        if (chromePid) {
            try { process.kill(chromePid, 'SIGTERM') } catch { /* already stopped */ }
        }
    }

    record.problems = problems
    await writeFile(join(dir, 'result.json'), JSON.stringify(record, null, 2))
    if (problems.length) {
        console.error(problems.join('\n'))
        process.exit(1)
    }
    log(`proved search evidence ${dir}`)
}

function readPublicEnv() {
    const text = readEnvFile()
    if (!text || !text.includes(envMarker)) {
        throw new Error('apps/web/.env.local is not the verify-screenpeak stack. Run up first.')
    }
    const url = text.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim()
    const anon = text.match(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)$/m)?.[1]?.trim()
    if (!url || !anon) throw new Error('Local env is missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.')
    return { url, anon }
}

function insertPrivateAda() {
    psql(databaseUrl, `
        INSERT INTO auth.users (id, email, raw_user_meta_data)
        SELECT gen_random_uuid(), '${adaEmail}', '{"username":"${adaUsername}"}'::jsonb
        WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = '${adaEmail}');
        UPDATE public.users
        SET username = '${adaUsername}',
            display_name = '${adaUsername}',
            library_public = false,
            loadout_public = false
        WHERE id = (SELECT id FROM auth.users WHERE email = '${adaEmail}');
    `)
}

function deleteAda() {
    try {
        psql(databaseUrl, `DELETE FROM auth.users WHERE email = '${adaEmail}';`)
    } catch (error) {
        log(error instanceof Error ? error.message : String(error))
    }
}

function insertResetUser() {
    psql(databaseUrl, `
        INSERT INTO auth.users (id, email, raw_user_meta_data)
        SELECT gen_random_uuid(), '${resetEmail}', '{"username":"${resetUsername}"}'::jsonb
        WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = '${resetEmail}');
        INSERT INTO verify_local.passwords (user_id, password)
        SELECT id, '${resetOldPassword}' FROM auth.users WHERE email = '${resetEmail}'
        ON CONFLICT (user_id) DO UPDATE SET password = EXCLUDED.password;
        UPDATE public.users
        SET username = '${resetUsername}', display_name = '${resetUsername}'
        WHERE id = (SELECT id FROM auth.users WHERE email = '${resetEmail}');
    `)
}

function deleteResetUser() {
    try {
        psql(databaseUrl, `DELETE FROM auth.users WHERE email = '${resetEmail}';`)
    } catch (error) {
        log(error instanceof Error ? error.message : String(error))
    }
}

function clearRecoveryFile() {
    writeFileSync(recoveryPath, '[]\n')
}

function readRecovery() {
    try {
        return JSON.parse(readFileSync(recoveryPath, 'utf8'))
    } catch {
        return []
    }
}

async function driveMobileNav() {
    const doctorRun = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'doctor'], { encoding: 'utf8' })
    process.stdout.write(doctorRun.stdout || '')
    if (doctorRun.status !== 0) fail('Doctor failed. Not driving.')
    if (await portOpen(expoPort)) fail(`Port ${expoPort} is already in use. Not starting Expo.`)
    const publicEnv = readPublicEnv()
    const library = readLibrary()
    const dir = join(evidenceRoot, 'mobile-nav')
    await mkdir(dir, { recursive: true })
    insertPrivateAda()
    const origin = `http://127.0.0.1:${appPort}`
    const expoOrigin = `http://localhost:${expoPort}`
    const expoPid = spawnLogged('expo', 'npm', ['run', 'web', '-w', '@screenpeak/mobile', '--', '--host', 'localhost', '--port', String(expoPort)], {
        CI: '1',
        BROWSER: 'none',
        EXPO_NO_TELEMETRY: '1',
        EXPO_PUBLIC_API_URL: origin,
        EXPO_PUBLIC_SUPABASE_URL: publicEnv.url,
        EXPO_PUBLIC_SUPABASE_ANON_KEY: publicEnv.anon,
    })
    const problems = []
    const shots = {}
    let page = null
    let chromePid = null
    let code = 0
    try {
        await waitForHttp(expoOrigin, 180_000)
        chromePid = await launchChrome()
        page = await connectChrome()
        const counts = '5 games · 3 completed'

        async function shot(name, needle, timeoutMs = 30_000) {
            await page.waitForText(needle, timeoutMs)
            const path = join(dir, name)
            await page.screenshot(path)
            shots[name] = path
            return page.panelText()
        }

        await page.navigate(expoOrigin)
        const feedOut = await shot('feed-signed-out.png', 'Sign up, log in, or browse the catalogue.', 180_000)
        if (!feedOut.includes('Welcome')) problems.push('signed-out feed is missing Welcome')
        if (await page.controlInView('Loadout') === 'yes') problems.push('signed-out feed shows Loadout')

        await page.clickControl('Browse')
        await page.waitForText('Games')
        await page.clickControl('Back')
        await page.waitForText('Sign up, log in, or browse the catalogue.')
        const afterBrowse = await page.panelText()
        if (!afterBrowse.includes('Welcome')) problems.push('Back from the catalogue did not return to the welcome')

        await page.clickTab('Explore')
        const exploreOut = await shot('explore-signed-out.png', 'Sign up to see what people you follow are playing.')
        if (!exploreOut.includes('Browse all')) problems.push('signed-out explore is missing Browse all')
        const searchField = await page.evaluate(`document.querySelector('input[aria-label="Search games"]') ? 'yes' : 'no'`)
        if (searchField !== 'yes') problems.push('signed-out explore is missing the search field')

        await page.clickTab('Library')
        const libraryOut = await shot('library-signed-out.png', 'Sign up to see your library.')
        if (library.games.some((name) => libraryOut.includes(name))) problems.push('signed-out library shows a game')

        await page.clickTab('Profile')
        const ownOut = await shot('own-profile-signed-out.png', 'Sign up to see your loadout and lists.')
        if (await page.controlInView('Loadout') === 'yes') problems.push('signed-out profile shows Loadout')
        if (await page.controlInView('Lists') === 'yes') problems.push('signed-out profile shows Lists')
        if (ownOut.includes('completed')) problems.push('signed-out profile shows a library preview')

        await page.navigate(`${expoOrigin}/user/${peekUsername}`)
        const publicOut = await shot('user-peek-signed-out.png', counts)
        if (await page.controlInView('Loadout') !== 'yes') problems.push('public peek profile hides Loadout')
        if (await page.controlInView('Lists') !== 'yes') problems.push('public peek profile hides Lists')
        if (!publicOut.includes(peekUsername)) problems.push('public peek profile is missing the username')

        const adaMark = page.eventMark()
        await page.navigate(`${expoOrigin}/user/${adaUsername}`)
        const adaOut = await shot('user-ada-signed-out.png', adaUsername)
        if (!adaOut.includes('Lists')) problems.push('private ada profile hides Lists')
        if (await page.controlInView('Loadout') === 'yes') problems.push('private ada profile shows Loadout')
        if (adaOut.includes('completed') || adaOut.includes('games ·')) problems.push('private ada profile shows a library preview')
        const adaLeaks = page.requestUrlsSince(adaMark).filter((url) => /\/api\/v1\/user\/ada\/(library|loadout|lists)/.test(url))
        if (adaLeaks.length) problems.push(`private ada hub fetched ${adaLeaks.join(', ')}`)

        await page.navigate(`${expoOrigin}/sign-in`)
        await page.waitForText('Log in')
        await page.fillPlaceholder('Email', peekEmail)
        await page.fillPlaceholder('Password', peekPassword)
        await page.clickControl('Log in')
        await page.waitUntil(`(() => {
            for (let i = 0; i < localStorage.length; i += 1) {
                const key = localStorage.key(i) || ''
                if (key.includes('auth-token') && localStorage.getItem(key)) return 'ok'
            }
            return 'waiting'
        })()`)
        await page.navigate(expoOrigin)
        const feedNeedles = ['Nothing in your feed yet.', ...library.games, "Couldn't load this screen"]
        await page.waitForTextEither(feedNeedles, 45_000)
        const feedInPath = join(dir, 'feed-signed-in.png')
        await page.screenshot(feedInPath)
        shots['feed-signed-in.png'] = feedInPath
        const feedIn = await page.panelText()
        if (feedIn.includes('Sign up, log in, or browse the catalogue.')) problems.push('signed-in feed still shows the welcome')
        if (feedIn.includes("Couldn't load this screen")) problems.push('signed-in feed failed to load')
        const feedOk = feedIn.includes('Nothing in your feed yet.') || library.games.some((name) => feedIn.includes(name))
        if (!feedOk) problems.push('signed-in feed has neither the empty state nor a library game')

        await page.clickTab('Explore')
        const exploreIn = await shot('explore-signed-in.png', 'Browse all')
        if (exploreIn.includes('Sign up to see what people you follow are playing.')) problems.push('signed-in explore still asks to sign up')

        await page.clickTab('Library')
        const libraryIn = await shot('library-signed-in.png', library.games[0])
        if (libraryIn.includes('Sign up to see your library.')) problems.push('signed-in library still asks to sign up')

        const gameName = library.games[0]
        const opened = await page.evaluate(`(() => {
            const name = ${JSON.stringify(gameName)}
            const nodes = [...document.querySelectorAll('a, [role="link"]')]
            const visible = nodes.filter((item) => item.getClientRects().length > 0)
            const pool = visible.length ? visible : nodes
            const node = pool.find((item) => (item.getAttribute('aria-label') || '').trim() === name)
            if (!node) return 'missing'
            node.click()
            return 'clicked'
        })()`)
        if (opened !== 'clicked') problems.push(`could not open ${gameName} from the library`)
        await page.waitForText('Add to list')
        const rateText = await page.evaluate(`(() => {
            const button = [...document.querySelectorAll('button')].find((item) => item.getAttribute('aria-label') === 'Rate' && item.getClientRects().length > 0)
            return button ? button.textContent.trim() : ''
        })()`)
        if (!rateText) problems.push('game screen is missing Rate')
        else await page.clickControl(rateText)
        await shot('game-rate-sheet.png', 'Review note')
        const rateSheet = await page.evaluate(`(() => {
            const dialog = [...document.querySelectorAll('[role="dialog"]')].find((item) => (item.innerText || '').includes('Review note'))
            return dialog ? dialog.innerText : ''
        })()`)
        if (!rateSheet.includes('Close')) problems.push('rate sheet is missing Close')
        if (!rateSheet.includes('10')) problems.push('rate sheet is missing the score list')
        await page.clickControl('Close')
        await page.waitUntil(`document.body.innerText.includes('Review note') ? 'waiting' : 'ok'`)

        await page.clickControl('Add to list')
        await shot('game-list-sheet.png', 'New list name')
        const listFocused = await page.evaluate(`(() => {
            const dialog = [...document.querySelectorAll('[role="dialog"]')].find((item) => (item.innerText || '').includes('New list name'))
            const input = dialog ? dialog.querySelector('input[placeholder="New list name"]') : null
            if (!input) return 'missing'
            input.focus()
            return document.activeElement === input ? (input.getAttribute('placeholder') || '') : 'unfocused'
        })()`)
        if (listFocused !== 'New list name') problems.push(`new list field was not focused (${listFocused})`)
        const listFocusedPath = join(dir, 'game-list-focused.png')
        await page.screenshot(listFocusedPath)
        shots['game-list-focused.png'] = listFocusedPath
        await page.clickControl('Close')
        await page.clickControl('Back')
        await page.waitForText(gameName)

        await page.clickTab('Profile')
        const ownIn = await shot('own-profile-as-peek.png', counts)
        if (await page.controlInView('Loadout') !== 'yes') problems.push('own profile hides Loadout')
        if (await page.controlInView('Lists') !== 'yes') problems.push('own profile hides Lists')
        if (!ownIn.includes(peekUsername)) problems.push('own profile is missing peek')

        async function assertLibraryTab(label) {
            await page.waitForText(library.games[0])
            const state = await page.evaluate(`(() => {
                const tab = document.querySelector('[role="tab"][aria-selected="true"]')
                const panel = document.querySelector('[role="tabpanel"][data-state="active"]')
                const root = panel || document.body
                const controls = [...root.querySelectorAll('button, [role="button"]')].map((item) => item.textContent.trim())
                return {
                    path: location.pathname,
                    tab: tab ? tab.textContent.trim() : '',
                    back: controls.includes('Back'),
                    loadout: controls.includes('Loadout'),
                    game: (root.innerText || '').includes(${JSON.stringify(library.games[0])}),
                }
            })()`)
            if (!String(state.path || '').endsWith('/library')) problems.push(`${label} landed on ${state.path}`)
            if (state.tab !== 'Library') problems.push(`${label} selected tab was ${state.tab || 'missing'}`)
            if (state.back) problems.push(`${label} left a Back control over the library`)
            if (state.loadout) problems.push(`${label} left the hub on top of the library`)
            if (!state.game) problems.push(`${label} library tab is missing a game`)
            return state
        }

        await page.clickControl(counts)
        const fromProfile = await assertLibraryTab('profile library preview')
        const fromProfilePath = join(dir, 'library-from-profile.png')
        await page.screenshot(fromProfilePath)
        shots['library-from-profile.png'] = fromProfilePath

        await page.navigate(`${expoOrigin}/user/${peekUsername}`)
        await page.waitForText(counts)
        await page.clickControl(counts)
        const fromPeek = await assertLibraryTab('peek profile library preview')
        const fromPeekPath = join(dir, 'library-from-peek.png')
        await page.screenshot(fromPeekPath)
        shots['library-from-peek.png'] = fromPeekPath

        const adaInMark = page.eventMark()
        await page.navigate(`${expoOrigin}/user/${adaUsername}`)
        const adaIn = await shot('user-ada-as-peek.png', adaUsername)
        if (!adaIn.includes('Lists')) problems.push('ada as peek hides Lists')
        if (await page.controlInView('Loadout') === 'yes') problems.push('ada as peek shows Loadout')
        if (adaIn.includes('completed') || adaIn.includes('games ·')) problems.push('ada as peek shows a library preview')
        const adaInLeaks = page.requestUrlsSince(adaInMark).filter((url) => /\/api\/v1\/user\/ada\/(library|loadout|lists)/.test(url))
        if (adaInLeaks.length) problems.push(`ada as peek fetched ${adaInLeaks.join(', ')}`)

        async function hiddenRoute(path, shotName) {
            await page.navigate(`${expoOrigin}${path}`)
            await page.waitForText('Not found.')
            const text = await page.bodyText()
            const leaked = library.games.filter((name) => text.includes(name))
            if (!text.includes("Couldn't load this screen")) problems.push(`${path} is missing the not-found title`)
            if (leaked.length) problems.push(`${path} showed ${leaked.join(', ')}`)
            const file = join(dir, shotName)
            await page.screenshot(file)
            shots[shotName] = file
            return { leaked }
        }
        const adaLibraryScreen = await hiddenRoute(`/user/${adaUsername}/library`, 'user-ada-library.png')
        const adaLoadoutScreen = await hiddenRoute(`/user/${adaUsername}/loadout`, 'user-ada-loadout.png')

        const token = await page.evaluate(`(() => {
            for (let i = 0; i < localStorage.length; i += 1) {
                const key = localStorage.key(i) || ''
                if (!key.includes('auth-token')) continue
                try {
                    const data = JSON.parse(localStorage.getItem(key) || '{}')
                    return data.access_token || ''
                } catch { return '' }
            }
            return ''
        })()`)
        const peekPublic = await fetch(`${origin}/api/v1/user/${peekUsername}`).then(async (response) => ({ status: response.status, body: await response.json() }))
        const adaPublic = await fetch(`${origin}/api/v1/user/${adaUsername}`).then(async (response) => ({ status: response.status, body: await response.json() }))
        const adaLibrary = await fetch(`${origin}/api/v1/user/${adaUsername}/library`)
        const adaLoadout = await fetch(`${origin}/api/v1/user/${adaUsername}/loadout`)
        const adaAsPeek = token
            ? await fetch(`${origin}/api/v1/user/${adaUsername}`, { headers: { Authorization: `Bearer ${token}` } }).then(async (response) => ({ status: response.status, body: await response.json() }))
            : { status: 0, body: null }
        const peekAsPeek = token
            ? await fetch(`${origin}/api/v1/user/${peekUsername}`, { headers: { Authorization: `Bearer ${token}` } }).then(async (response) => ({ status: response.status, body: await response.json() }))
            : { status: 0, body: null }
        if (!token) problems.push('sign-in did not store an access token')
        if (peekPublic.body?.library_stats?.total_games !== 5) problems.push('signed-out peek library_stats missing')
        if (peekPublic.body?.profile?.loadout_public !== true) problems.push('peek loadout_public is not true')
        if (adaPublic.body?.library_stats !== null) problems.push('signed-out ada library_stats was not null')
        if (adaPublic.body?.profile?.library_public !== false || adaPublic.body?.profile?.loadout_public !== false) problems.push('ada privacy flags were not false')
        if (adaLibrary.status !== 404 || adaLoadout.status !== 404) problems.push(`ada library ${adaLibrary.status} loadout ${adaLoadout.status}`)
        if (adaAsPeek.body?.viewer?.is_owner !== false) problems.push('ada viewer is_owner was not false')
        if (adaAsPeek.body?.library_stats !== null) problems.push('ada as peek still received library_stats')
        if (peekAsPeek.body?.viewer?.is_owner !== true) problems.push('peek viewer is_owner was not true')
        await writeFile(join(dir, 'result.json'), JSON.stringify({
            feature: 'mobile-nav',
            expo: expoOrigin,
            shots,
            peekSignedOut: { status: peekPublic.status, library_stats: peekPublic.body?.library_stats ?? null, loadout_public: peekPublic.body?.profile?.loadout_public ?? null },
            adaSignedOut: { status: adaPublic.status, library_stats: adaPublic.body?.library_stats ?? null, library_public: adaPublic.body?.profile?.library_public ?? null, loadout_public: adaPublic.body?.profile?.loadout_public ?? null },
            adaLibraryStatus: adaLibrary.status,
            adaLoadoutStatus: adaLoadout.status,
            adaAsPeek: { status: adaAsPeek.status, is_owner: adaAsPeek.body?.viewer?.is_owner ?? null, library_stats: adaAsPeek.body?.library_stats ?? null },
            peekAsPeek: { status: peekAsPeek.status, is_owner: peekAsPeek.body?.viewer?.is_owner ?? null },
            libraryFromProfile: fromProfile,
            libraryFromPeek: fromPeek,
            adaLibraryScreen,
            adaLoadoutScreen,
            problems,
        }, null, 2))
    } catch (error) {
        try { await page?.screenshot(join(dir, 'failed.png')) } catch { /* the page may already be gone */ }
        console.error(error instanceof Error ? error.message : String(error))
        code = 1
    } finally {
        page?.close()
        stopRecorded('chrome')
        if (chromePid) {
            try { process.kill(chromePid, 'SIGTERM') } catch { /* already stopped */ }
        }
        stopRecorded('expo')
        if (expoPid) {
            try { process.kill(-expoPid, 'SIGTERM') } catch { /* already stopped */ }
            try { process.kill(expoPid, 'SIGTERM') } catch { /* already stopped */ }
        }
        deleteAda()
    }
    if (code !== 0) process.exit(code)
    if (problems.length) {
        console.error(problems.join('\n'))
        process.exit(1)
    }
    log(`proved mobile-nav evidence ${dir}`)
}

async function postRecover(email) {
    const response = await fetch(`http://127.0.0.1:${gatewayPort}/auth/v1/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
    })
    const body = await response.text()
    return { status: response.status, body }
}

async function driveForgotPassword() {
    const doctorRun = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'doctor'], { encoding: 'utf8' })
    process.stdout.write(doctorRun.stdout || '')
    if (doctorRun.status !== 0) fail('Doctor failed. Not driving.')
    if (await portOpen(expoPort)) fail(`Port ${expoPort} is already in use. Not starting Expo.`)
    const publicEnv = readPublicEnv()
    const dir = join(evidenceRoot, 'mobile-forgot-password')
    await mkdir(dir, { recursive: true })
    insertResetUser()
    clearRecoveryFile()
    const knownRecover = await postRecover(resetEmail)
    const unknownRecover = await postRecover('nobody-reset@example.com')
    clearRecoveryFile()
    const origin = `http://127.0.0.1:${appPort}`
    const expoOrigin = `http://localhost:${expoPort}`
    const expoPid = spawnLogged('expo', 'npm', ['run', 'web', '-w', '@screenpeak/mobile', '--', '--host', 'localhost', '--port', String(expoPort)], {
        CI: '1',
        BROWSER: 'none',
        EXPO_NO_TELEMETRY: '1',
        EXPO_PUBLIC_API_URL: origin,
        EXPO_PUBLIC_SUPABASE_URL: publicEnv.url,
        EXPO_PUBLIC_SUPABASE_ANON_KEY: publicEnv.anon,
    })
    const problems = []
    const shots = {}
    const confirmation = 'If that email has an account, a reset link is on its way.'
    let page = null
    let chromePid = null
    let code = 0
    let storedPasswordMatches = false
    let oldPasswordRejected = false
    let repeatDisabled = false
    try {
        await waitForHttp(expoOrigin, 180_000)
        chromePid = await launchChrome()
        page = await connectChrome()

        async function shot(name, needle, timeoutMs = 30_000) {
            await page.waitForText(needle, timeoutMs)
            const path = join(dir, name)
            await page.screenshot(path)
            shots[name] = path
            return page.bodyText()
        }

        await page.navigate(expoOrigin)
        const welcome = await shot('signed-out-home.png', 'Sign up, log in, or browse the catalogue.', 180_000)
        if (!welcome.includes('Welcome')) problems.push('signed-out home is missing Welcome')

        await page.navigate(`${expoOrigin}/auth/update-password`)
        const blocked = await shot('update-without-link.png', 'This page only works from the reset link in your email.')
        if (!blocked.includes('Request a new link')) problems.push('set-new-password without a session hides Request a new link')
        if (!blocked.includes('Back')) problems.push('set-new-password is missing Back')

        await page.navigate(`${expoOrigin}/sign-in`)
        await page.waitForText('Forgot password?')
        await page.clickControl('Forgot password?')
        await page.waitForText('Reset password')
        await page.clickControl('Back')
        await page.waitForText('Forgot password?')
        await page.clickControl('Forgot password?')
        const request = await shot('request.png', 'Send reset link')
        if (!request.includes('Reset password')) problems.push('request screen is missing Reset password')
        if (!request.includes('Back')) problems.push('request screen is missing Back')

        await page.fillPlaceholder('Email', resetEmail)
        await page.clickControl('Send reset link')
        const confirmed = await shot('confirmation.png', confirmation)
        if (confirmed.includes('not found') || confirmed.includes('does not exist')) problems.push('confirmation names whether the account exists')
        repeatDisabled = await page.evaluate(`(() => {
            const buttons = [...document.querySelectorAll('button')].filter((item) => item.getClientRects().length > 0)
            const button = buttons.find((item) => item.textContent.trim() === 'Send reset link')
            return button && button.disabled ? 'yes' : 'no'
        })()`) === 'yes'
        if (!repeatDisabled) problems.push('Send reset link stayed enabled after the confirmation')
        await page.clickControl('Send reset link')
        const recovery = readRecovery().filter((entry) => entry.email === resetEmail && entry.code)
        if (recovery.length !== 1) problems.push(`expected one reset code, found ${recovery.length}`)
        const entry = recovery[0]
        if (!entry?.redirectTo?.startsWith(`${expoOrigin}/auth/confirm?next=/auth/update-password`)) {
            problems.push(`redirect was ${entry?.redirectTo || 'missing'}`)
        }
        if (!entry?.code) throw new Error('The local gateway did not record a reset code.')
        if (!entry.challenge) problems.push('reset request did not send a PKCE challenge')
        const link = new URL(entry.redirectTo)
        link.searchParams.set('code', entry.code)

        await page.navigate(link.toString())
        const form = await shot('update-password.png', 'Set a new password', 45_000)
        const newPasswordField = await page.evaluate(`(() => {
            const inputs = [...document.querySelectorAll('input[placeholder="New password"]')].filter((item) => item.getClientRects().length > 0)
            return inputs.length ? 'yes' : 'no'
        })()`)
        if (newPasswordField !== 'yes') problems.push('set-new-password is missing the new password field')
        if (form.includes('This page only works from the reset link')) problems.push('the reset link did not start a recovery session')
        await page.fillPlaceholder('New password', resetNewPassword)
        await page.fillPlaceholder('Confirm new password', resetNewPassword)
        await page.clickControl('Update password')
        await shot('updated.png', 'Password updated. Taking you home…')

        await page.evaluate(`localStorage.clear(); 'ok'`)
        await page.navigate(`${expoOrigin}/sign-in`)
        await page.waitForText('Log in')
        await page.fillPlaceholder('Email', resetEmail)
        await page.fillPlaceholder('Password', resetOldPassword)
        await page.clickControl('Log in')
        await page.waitForText('Invalid login credentials')
        oldPasswordRejected = true
        await page.fillPlaceholder('Password', resetNewPassword)
        await page.clickControl('Log in')
        await page.waitUntil(`(() => {
            for (let i = 0; i < localStorage.length; i += 1) {
                const key = localStorage.key(i) || ''
                if (key.includes('auth-token') && localStorage.getItem(key)) return 'ok'
            }
            return 'waiting'
        })()`)
        await page.navigate(expoOrigin)
        await page.waitForText('Nothing in your feed yet.', 45_000)
        const signedIn = await shot('signed-in.png', 'Nothing in your feed yet.')
        if (signedIn.includes('Sign up, log in, or browse the catalogue.')) problems.push('signing in with the new password still shows the welcome')

        await page.navigate(`${expoOrigin}/auth/update-password`)
        const normal = await shot('normal-session.png', 'This page only works from the reset link in your email.')
        const normalField = await page.evaluate(`(() => {
            const inputs = [...document.querySelectorAll('input[placeholder="New password"]')].filter((item) => item.getClientRects().length > 0)
            return inputs.length ? 'yes' : 'no'
        })()`)
        if (normalField === 'yes') problems.push('a normal session can set a new password')
        if (!normal.includes('Request a new link')) problems.push('a normal session hides Request a new link')

        const stored = psql(databaseUrl, `select password from verify_local.passwords where user_id = (select id from auth.users where email = '${resetEmail}')`, ['-tA'])
        storedPasswordMatches = stored === resetNewPassword
        if (!storedPasswordMatches) problems.push('verify_local.passwords does not have the new password')
        if (knownRecover.status !== 200 || knownRecover.body !== unknownRecover.body) {
            problems.push('recover responses differ for an existing and a missing email')
        }
        await writeFile(join(dir, 'result.json'), JSON.stringify({
            feature: 'mobile-forgot-password',
            expo: expoOrigin,
            shots,
            confirmation,
            recoverStatus: { known: knownRecover.status, unknown: unknownRecover.status },
            recoverBodiesMatch: knownRecover.status === 200 && knownRecover.body === unknownRecover.body,
            redirectTo: entry.redirectTo,
            pkceChallenge: Boolean(entry.challenge),
            repeatDisabled,
            oldPasswordRejected,
            storedPasswordMatches,
            problems,
        }, null, 2))
    } catch (error) {
        try { await page?.screenshot(join(dir, 'failed.png')) } catch { /* the page may already be gone */ }
        console.error(error instanceof Error ? error.message : String(error))
        code = 1
        try {
            await writeFile(join(dir, 'result.json'), JSON.stringify({
                feature: 'mobile-forgot-password',
                shots,
                problems,
                error: error instanceof Error ? error.message : String(error),
            }, null, 2))
        } catch { /* evidence dir may be missing */ }
    } finally {
        page?.close()
        stopRecorded('chrome')
        if (chromePid) {
            try { process.kill(chromePid, 'SIGTERM') } catch { /* already stopped */ }
        }
        stopRecorded('expo')
        if (expoPid) {
            try { process.kill(-expoPid, 'SIGTERM') } catch { /* already stopped */ }
            try { process.kill(expoPid, 'SIGTERM') } catch { /* already stopped */ }
        }
        deleteResetUser()
    }
    if (code !== 0) process.exit(code)
    if (problems.length) {
        console.error(problems.join('\n'))
        process.exit(1)
    }
    log(`proved mobile-forgot-password evidence ${dir}`)
}

function deleteSignupUser() {
    try {
        psql(databaseUrl, `DELETE FROM auth.users WHERE email = '${signupEmail}';`)
    } catch (error) {
        log(error instanceof Error ? error.message : String(error))
    }
}

function readSignups() {
    try {
        return JSON.parse(readFileSync(signupPath, 'utf8'))
    } catch {
        return []
    }
}

async function driveSignUp() {
    const doctorRun = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'doctor'], { encoding: 'utf8' })
    process.stdout.write(doctorRun.stdout || '')
    if (doctorRun.status !== 0) fail('Doctor failed. Not driving.')
    if (await portOpen(expoPort)) fail(`Port ${expoPort} is already in use. Not starting Expo.`)
    const publicEnv = readPublicEnv()
    const dir = join(evidenceRoot, 'mobile-sign-up')
    await mkdir(dir, { recursive: true })
    deleteSignupUser()
    writeFileSync(signupPath, '[]\n')
    const origin = `http://127.0.0.1:${appPort}`
    const expoOrigin = `http://localhost:${expoPort}`
    const expoPid = spawnLogged('expo', 'npm', ['run', 'web', '-w', '@screenpeak/mobile', '--', '--host', 'localhost', '--port', String(expoPort)], {
        CI: '1',
        BROWSER: 'none',
        EXPO_NO_TELEMETRY: '1',
        EXPO_PUBLIC_API_URL: origin,
        EXPO_PUBLIC_SUPABASE_URL: publicEnv.url,
        EXPO_PUBLIC_SUPABASE_ANON_KEY: publicEnv.anon,
    })
    const problems = []
    const shots = {}
    const notice = 'Check your email to confirm the account, then log in.'
    let page = null
    let chromePid = null
    let code = 0
    let signupChallenge = undefined
    let confirmed = false
    let signedIn = false
    try {
        await waitForHttp(expoOrigin, 180_000)
        chromePid = await launchChrome()
        page = await connectChrome()

        async function shot(name, needle, timeoutMs = 30_000) {
            await page.waitForText(needle, timeoutMs)
            const path = join(dir, name)
            await page.screenshot(path)
            shots[name] = path
            return page.bodyText()
        }

        await page.navigate(`${expoOrigin}/sign-up`)
        const form = await shot('request.png', 'Sign up', 180_000)
        const usernameField = await page.evaluate(`(() => {
            const inputs = [...document.querySelectorAll('input[placeholder="Username"]')].filter((item) => item.getClientRects().length > 0)
            return inputs.length ? 'yes' : 'no'
        })()`)
        if (usernameField !== 'yes') problems.push('sign-up is missing Username')
        if (!form.includes('Back')) problems.push('sign-up is missing Back')
        await page.fillPlaceholder('Email', signupEmail)
        await page.fillPlaceholder('Username', signupUsername)
        await page.fillPlaceholder('Password', signupPassword)
        await page.clickControl('Sign up')
        const asked = await shot('confirmation.png', notice)
        if (asked.includes('code challenge') || asked.includes('verifier')) problems.push('sign-up confirmation mentions a code verifier')
        const signups = readSignups().filter((entry) => entry.email === signupEmail)
        if (signups.length !== 1) problems.push(`expected one signup, found ${signups.length}`)
        const entry = signups[0] || {}
        signupChallenge = entry.challenge ?? null
        if (signupChallenge !== null) problems.push('sign-up sent a PKCE code challenge')
        if (!entry.token) throw new Error('The local gateway did not record a signup confirmation token.')

        await page.navigate(`${expoOrigin}/sign-in`)
        await page.waitForText('Log in')
        await page.fillPlaceholder('Email', signupEmail)
        await page.fillPlaceholder('Password', signupPassword)
        await page.clickControl('Log in')
        await shot('unconfirmed.png', 'Email not confirmed')

        const verify = await fetch(`http://127.0.0.1:${gatewayPort}/auth/v1/verify?token=${entry.token}&type=signup`)
        confirmed = verify.status === 200
        if (!confirmed) problems.push(`confirmation link returned ${verify.status}`)

        await page.fillPlaceholder('Password', signupPassword)
        await page.clickControl('Log in')
        await page.waitUntil(`(() => {
            for (let i = 0; i < localStorage.length; i += 1) {
                const key = localStorage.key(i) || ''
                if (key.includes('auth-token') && localStorage.getItem(key)) return 'ok'
            }
            return 'waiting'
        })()`)
        await page.navigate(expoOrigin)
        const home = await shot('signed-in.png', 'Nothing in your feed yet.', 45_000)
        signedIn = !home.includes('Sign up, log in, or browse the catalogue.')
        if (!signedIn) problems.push('confirmed sign-up still shows the welcome')

        await writeFile(join(dir, 'result.json'), JSON.stringify({
            feature: 'mobile-sign-up',
            expo: expoOrigin,
            shots,
            notice,
            signupChallenge,
            confirmed,
            signedIn,
            problems,
        }, null, 2))
    } catch (error) {
        try { await page?.screenshot(join(dir, 'failed.png')) } catch { /* the page may already be gone */ }
        console.error(error instanceof Error ? error.message : String(error))
        code = 1
        try {
            await writeFile(join(dir, 'result.json'), JSON.stringify({
                feature: 'mobile-sign-up',
                shots,
                signupChallenge,
                confirmed,
                signedIn,
                problems,
                error: error instanceof Error ? error.message : String(error),
            }, null, 2))
        } catch { /* evidence dir may be missing */ }
    } finally {
        page?.close()
        stopRecorded('chrome')
        if (chromePid) {
            try { process.kill(chromePid, 'SIGTERM') } catch { /* already stopped */ }
        }
        stopRecorded('expo')
        if (expoPid) {
            try { process.kill(-expoPid, 'SIGTERM') } catch { /* already stopped */ }
            try { process.kill(expoPid, 'SIGTERM') } catch { /* already stopped */ }
        }
        deleteSignupUser()
    }
    if (code !== 0) process.exit(code)
    if (problems.length) {
        console.error(problems.join('\n'))
        process.exit(1)
    }
    log(`proved mobile-sign-up evidence ${dir}`)
}

async function driveMobileGame() {
    const doctorRun = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'doctor'], { encoding: 'utf8' })
    process.stdout.write(doctorRun.stdout || '')
    if (doctorRun.status !== 0) fail('Doctor failed. Not driving.')
    if (await portOpen(expoPort)) fail(`Port ${expoPort} is already in use. Not starting Expo.`)
    const target = peekWriteTarget()
    const beforeCounts = peekCounts()
    const nextRating = target.rating === 10 ? 9 : 10
    const nextStatus = target.status === 'playing' ? 'backlog' : 'playing'
    const nextStatusLabel = nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)
    const firstReview = 'Phone run one.'
    const editedReview = 'Phone run two.'
    const listName = 'Phone Shelf'
    const publicEnv = readPublicEnv()
    const dir = join(evidenceRoot, 'mobile-game')
    await mkdir(dir, { recursive: true })
    const origin = `http://127.0.0.1:${appPort}`
    const expoOrigin = `http://localhost:${expoPort}`
    const wishlist = psql(databaseUrl, `
        select id::text || '|' || name from lists
        where user_id = '${target.userId}'::uuid
        order by is_default desc, name
        limit 1
    `, ['-tA'])
    const [wishlistId, wishlistName] = (wishlist || '').split('|')
    psql(databaseUrl, `
        delete from lists where user_id = '${target.userId}'::uuid and name = '${listName}';
        ${wishlistId ? `delete from list_games where list_id = '${wishlistId}'::uuid and game_id = '${target.gameId}'::uuid;` : ''}
    `)
    const expoPid = spawnLogged('expo', 'npm', ['run', 'web', '-w', '@screenpeak/mobile', '--', '--host', 'localhost', '--port', String(expoPort)], {
        CI: '1',
        BROWSER: 'none',
        EXPO_NO_TELEMETRY: '1',
        EXPO_PUBLIC_API_URL: origin,
        EXPO_PUBLIC_SUPABASE_URL: publicEnv.url,
        EXPO_PUBLIC_SUPABASE_ANON_KEY: publicEnv.anon,
    })
    const problems = []
    const shots = {}
    const record = {
        feature: 'mobile-game',
        slug: target.slug,
        name: target.name,
        nextRating,
        nextStatus,
        wishlistName: wishlistName || null,
    }
    let page = null
    let chromePid = null
    let createdListId = ''
    try {
        await waitForHttp(expoOrigin, 180_000)
        chromePid = await launchChrome()
        page = await connectChrome()
        await page.setViewport(375, 667)

        async function reveal(needle) {
            await page.evaluate(`(() => {
                const needle = ${JSON.stringify(needle)}
                const nodes = [...document.querySelectorAll('body *')]
                const match = nodes.find((node) => {
                    const text = node.innerText || ''
                    return node.children.length < 6 && text.includes(needle) && text.length < 600
                })
                if (match) match.scrollIntoView({ block: 'center', inline: 'nearest' })
            })()`)
        }
        async function shot(name, needle, timeoutMs = 30_000) {
            await page.waitForText(needle, timeoutMs)
            await reveal(needle)
            const path = join(dir, name)
            await page.screenshot(path)
            shots[name] = path
            return page.bodyText()
        }

        await page.navigate(`${expoOrigin}/games/${encodeURIComponent(target.slug)}`)
        const signedOut = await shot('se-signed-out.png', target.name, 180_000)
        if (!signedOut.includes(target.name)) problems.push('signed-out game page is missing the name')
        if (signedOut.includes('Sign up to rate, log, or list this game.')) problems.push('signup prompt is open before an action')
        await page.clickLabel('Rate')
        const prompt = await shot('signup.png', 'Sign up to rate, log, or list this game.')
        if (!prompt.includes('Sign up')) problems.push('signup prompt is missing Sign up')
        await page.clickControl('Close')
        await page.waitUntil(`document.body.innerText.includes('Sign up to rate, log, or list this game.') ? 'waiting' : 'ok'`)

        await page.navigate(`${expoOrigin}/sign-in`)
        await page.waitForText('Log in')
        await page.fillPlaceholder('Email', peekEmail)
        await page.fillPlaceholder('Password', peekPassword)
        await page.clickControl('Log in')
        await page.waitUntil(`(() => {
            for (let i = 0; i < localStorage.length; i += 1) {
                const key = localStorage.key(i) || ''
                if (key.includes('auth-token') && localStorage.getItem(key)) return 'ok'
            }
            return 'waiting'
        })()`)

        psql(databaseUrl, `
            update library_entries
            set hours_played = 12.5, play_count = 4, completed_all_achievements = true
            where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
        `)
        await page.navigate(`${expoOrigin}/games/${encodeURIComponent(target.slug)}`)
        const signedIn = await shot('se-signed-in.png', target.name)
        if (!signedIn.includes('Your score')) problems.push('signed-in game page is missing your score')
        if (signedIn.includes('Sign up to rate, log, or list this game.')) problems.push('signed-in game page opened the signup prompt')

        async function waitForRateSheetClosed() {
            await page.waitUntil(`(() => {
                const text = document.body.innerText || ''
                if (text.includes('Review note') || text.includes('Saving')) return 'waiting'
                return 'ok'
            })()`)
        }
        await page.clickLabel('Rate')
        await page.waitForText('Review note')
        await page.clickLabel(`Score ${nextRating}`)
        await page.fillLabel('Review note', firstReview)
        await page.clickControl('Submit rating')
        await waitForRateSheetClosed()
        const rated = await shot('review-saved.png', firstReview)
        if (!rated.includes(String(nextRating))) problems.push('saved review did not show the new score')
        const reviewRow = psql(databaseUrl, `
            select rating::text || '|' || coalesce(review, '')
            from ratings_reviews
            where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
        `, ['-tA'])
        record.reviewAfterRate = reviewRow
        if (reviewRow !== `${nextRating}|${firstReview}`) problems.push(`postgres after rate ${reviewRow}`)

        await page.clickLabel('Rate')
        await page.waitForText('Review note')
        await page.fillLabel('Review note', editedReview)
        await page.clickControl('Submit rating')
        await waitForRateSheetClosed()
        await shot('review-edited.png', editedReview)
        const editedRow = psql(databaseUrl, `
            select rating::text || '|' || coalesce(review, '')
            from ratings_reviews
            where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
        `, ['-tA'])
        record.reviewAfterEdit = editedRow
        if (editedRow !== `${nextRating}|${editedReview}`) problems.push(`postgres after edit ${editedRow}`)

        await page.clickLabel('Rate')
        await page.waitForText('Delete review')
        await page.clickControl('Delete review')
        await page.waitForText('Delete this review? Your score stays.')
        await page.clickControl('Delete the written review')
        await waitForRateSheetClosed()
        await page.waitUntil(`document.body.innerText.includes(${JSON.stringify(editedReview)}) ? 'waiting' : 'ok'`)
        const deletedText = await page.bodyText()
        const deletedPath = join(dir, 'review-deleted.png')
        await page.screenshot(deletedPath)
        shots['review-deleted.png'] = deletedPath
        if (deletedText.includes(editedReview) || deletedText.includes(firstReview)) problems.push('deleted review text is still on the page')
        if (!deletedText.includes(`Your score ${nextRating}`)) problems.push('deleting the review cleared the score')
        const deletedRow = psql(databaseUrl, `
            select rating::text || '|' || coalesce(review, '')
            from ratings_reviews
            where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
        `, ['-tA'])
        record.reviewAfterDelete = deletedRow
        if (deletedRow !== `${nextRating}|`) problems.push(`postgres after delete ${deletedRow}`)

        const libraryMark = page.eventMark()
        await page.clickLabel('Save game')
        await page.waitForText('Show library details')
        await page.clickLabel(`Log as ${nextStatus}`)
        await page.clickControl('Update library entry')
        await page.waitUntil(`document.body.innerText.includes('Show library details') ? 'waiting' : 'ok'`)
        await page.waitForText(`Status ${nextStatusLabel}`)
        const libraryCalls = page.requestsSince(libraryMark)
            .filter((item) => item.method === 'PUT' && item.url.includes(`/api/v1/me/library/${target.gameId}`))
        record.libraryBodies = libraryCalls.map((item) => item.body)
        const libraryBody = libraryCalls.at(-1)?.body || ''
        let libraryJson = null
        try { libraryJson = JSON.parse(libraryBody) } catch { libraryJson = null }
        if (!libraryJson || Object.keys(libraryJson).join(',') !== 'status' || libraryJson.status !== nextStatus) {
            problems.push(`library write was not status-only ${libraryBody}`)
        }
        const kept = psql(databaseUrl, `
            select status || '|' || coalesce(hours_played::text, '') || '|' || coalesce(play_count::text, '') || '|' || coalesce(completed_all_achievements::text, '')
            from library_entries
            where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
        `, ['-tA'])
        record.libraryAfterStatus = kept
        const [keptStatus, keptHours, keptPlays, keptComplete] = (kept || '').split('|')
        if (keptStatus !== nextStatus || Number(keptHours) !== 12.5 || keptPlays !== '4' || (keptComplete !== 't' && keptComplete !== 'true')) {
            problems.push(`status-only save changed library details ${kept}`)
        }
        await shot('library-saved.png', `Status ${nextStatusLabel}`)

        if (!wishlistName) {
            problems.push('peek has no list to add the game to')
        } else {
            await page.clickControl('Add to list')
            await page.waitForText('New list name')
            await page.clickLabel(`Add to ${wishlistName}`)
            await page.waitUntil(`(() => {
                const node = [...document.querySelectorAll('button, [role="button"]')].find((item) => {
                    const text = item.textContent || ''
                    return text.includes(${JSON.stringify(wishlistName)}) && text.includes('On this list')
                })
                return node ? 'ok' : 'waiting'
            })()`)
            let membership = '0'
            const membershipStarted = Date.now()
            while (Date.now() - membershipStarted < 15_000) {
                membership = psql(databaseUrl, `
                    select count(*) from list_games
                    where list_id = '${wishlistId}'::uuid and game_id = '${target.gameId}'::uuid
                `, ['-tA'])
                if (membership === '1') break
                await new Promise((resolve) => setTimeout(resolve, 200))
            }
            record.wishlistCount = Number(membership)
            if (membership !== '1') problems.push(`wishlist membership ${membership}`)
            await page.fillLabel('New list name', listName)
            await page.fillLabel('List description', 'From the phone')
            await page.waitUntil(`(() => {
                const node = [...document.querySelectorAll('button, [role="button"]')].find((item) => item.textContent.trim() === 'Create list')
                if (!node) return 'waiting'
                node.scrollIntoView({ block: 'center' })
                return 'ok'
            })()`)
            await page.clickControl('Create list')
            await page.waitForText(listName)
            const created = psql(databaseUrl, `
                select l.id::text || '|' || count(lg.game_id)::text
                from lists l
                left join list_games lg on lg.list_id = l.id and lg.game_id = '${target.gameId}'::uuid
                where l.user_id = '${target.userId}'::uuid and l.name = '${listName}'
                group by l.id
            `, ['-tA'])
            const [createdId, createdCount] = (created || '').split('|')
            createdListId = createdId || ''
            record.createdList = created
            if (!createdId || createdCount !== '1') problems.push(`created list ${created || 'missing'}`)
            const listPath = join(dir, 'list-created.png')
            await page.screenshot(listPath)
            shots['list-created.png'] = listPath
            await page.clickControl('Close')
        }

        await page.clickLabel('Rate')
        await page.waitForText('Review note')
        await page.setViewport(375, 420)
        await page.evaluate(`(() => {
            const dialog = document.querySelector('[role="dialog"]')
            const field = dialog && dialog.querySelector('[aria-label="Review note"]')
            if (!field) return 'missing'
            field.focus()
            field.scrollIntoView({ block: 'center' })
            return 'focused'
        })()`)
        try {
            await page.waitUntil(`(() => {
                const dialog = document.querySelector('[role="dialog"]')
                const field = dialog && dialog.querySelector('textarea, input')
                const labeled = dialog && dialog.querySelector('[aria-label="Review note"]')
                const target = labeled || field
                if (!target) return 'missing field'
                if (document.activeElement !== target) target.focus()
                target.scrollIntoView({ block: 'center' })
                const active = document.activeElement
                const focused = target === active || (active && target.contains(active))
                const box = target.getBoundingClientRect()
                const visible = Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0)
                if (focused && visible >= 48) return 'ok'
                const name = active ? (active.getAttribute('aria-label') || active.tagName) : 'none'
                return 'top=' + Math.round(box.top) + ' bottom=' + Math.round(box.bottom) + ' visible=' + Math.round(visible) + ' active=' + name
            })()`, 5_000)
        } catch (error) {
            problems.push(error instanceof Error ? error.message : String(error))
        }
        await page.waitForText('Close')
        const keyboardPath = join(dir, 'keyboard-open.png')
        await page.screenshot(keyboardPath)
        shots['keyboard-open.png'] = keyboardPath
        const keyboardSheet = await page.evaluate(`(() => {
            const dialog = [...document.querySelectorAll('[role="dialog"]')].find((item) => (item.innerText || '').includes('Review note'))
            if (!dialog) return ''
            const close = [...dialog.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Close')
            const box = close ? close.getBoundingClientRect() : null
            return JSON.stringify({
                text: dialog.innerText,
                closeTop: box ? box.top : null,
                closeHeight: box ? box.height : null,
                viewport: window.innerHeight,
            })
        })()`)
        record.keyboard = JSON.parse(keyboardSheet || '{}')
        if (!record.keyboard.text || !record.keyboard.text.includes('Close')) problems.push('keyboard sheet is missing Close')
        if (!record.keyboard.text.includes('Review note')) problems.push('keyboard sheet is missing Review note')
        if (record.keyboard.closeTop == null || record.keyboard.closeTop < 0 || record.keyboard.closeTop + record.keyboard.closeHeight > record.keyboard.viewport + 1) {
            problems.push(`Close is outside the keyboard viewport ${keyboardSheet}`)
        }
    } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error))
    } finally {
        if (createdListId) {
            try {
                const token = await peekAccessToken()
                const del = await fetch(`${origin}/api/v1/lists/${createdListId}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
                })
                record.listDeleteStatus = del.status
                if (del.status !== 204) problems.push(`list delete status ${del.status}`)
            } catch (error) {
                problems.push(error instanceof Error ? error.message : String(error))
            }
        }
        psql(databaseUrl, `
            delete from lists where user_id = '${target.userId}'::uuid and name = '${listName}';
            ${wishlistId ? `delete from list_games where list_id = '${wishlistId}'::uuid and game_id = '${target.gameId}'::uuid;` : ''}
        `)
        restorePeekWrites(target)
        page?.close()
        stopRecorded('chrome')
        if (chromePid) {
            try { process.kill(chromePid, 'SIGTERM') } catch { /* already stopped */ }
        }
        stopRecorded('expo')
        if (expoPid) {
            try { process.kill(-expoPid, 'SIGTERM') } catch { /* already stopped */ }
            try { process.kill(expoPid, 'SIGTERM') } catch { /* already stopped */ }
        }
    }

    const after = peekCounts()
    record.countsBefore = beforeCounts
    record.countsAfter = after
    if (after.ratings !== 5 || after.library !== 5) problems.push(`counts after restore ${after.ratings}/${after.library}`)
    const restored = psql(databaseUrl, `
        select rating::text || '|' || encode(convert_to(coalesce(review, ''), 'UTF8'), 'base64') || '|' || (
            select status from library_entries
            where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
        )
        from ratings_reviews
        where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
    `, ['-tA'])
    record.restored = restored
    if (restored !== `${target.rating}|${target.reviewB64}|${target.status}`) problems.push(`restore mismatch ${restored}`)
    record.problems = problems
    record.shots = shots
    await writeFile(join(dir, 'result.json'), JSON.stringify(record, null, 2))
    await writeFile(join(dir, 'postgres.txt'), [
        `slug=${target.slug}`,
        `after_rate=${record.reviewAfterRate ?? ''}`,
        `after_edit=${record.reviewAfterEdit ?? ''}`,
        `after_delete=${record.reviewAfterDelete ?? ''}`,
        `library=${record.libraryAfterStatus ?? ''}`,
        `library_body=${(record.libraryBodies || []).join(' ')}`,
        `wishlist=${record.wishlistCount ?? ''}`,
        `created=${record.createdList ?? ''}`,
        `counts_after=${after.ratings}/${after.library}`,
        `restored=${restored}`,
        '',
    ].join('\n'))
    if (problems.length) {
        console.error(problems.join('\n'))
        process.exit(1)
    }
    log(`proved mobile-game evidence ${dir}`)
}

async function drive(feature) {
    if (feature === 'game-page') return driveGamePage()
    if (feature === 'mobile-game') return driveMobileGame()
    if (feature === 'read-endpoints') return driveReadEndpoints()
    if (feature === 'game-writes') return driveGameWrites()
    if (feature === 'search') return driveSearch()
    if (feature === 'mobile-nav') return driveMobileNav()
    if (feature === 'mobile-forgot-password') return driveForgotPassword()
    if (feature === 'mobile-sign-up') return driveSignUp()
    if (feature !== 'loadout-readout') fail(`Unknown feature ${feature || ''}. Mapped features: loadout-readout, game-page, read-endpoints, game-writes, search, mobile-nav, mobile-forgot-password, mobile-sign-up, mobile-game.`)
    const doctorRun = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'doctor'], { encoding: 'utf8' })
    process.stdout.write(doctorRun.stdout || '')
    if (doctorRun.status !== 0) fail('Doctor failed. Not driving.')
    resetReadout()
    const dir = join(evidenceRoot, 'loadout-readout')
    await mkdir(dir, { recursive: true })
    const chromePid = await launchChrome()
    let page = null
    let code = 0
    try {
        page = await connectChrome()
        await page.navigate(`http://127.0.0.1:${appPort}/`)
        await page.waitForText('Sign In')
        await page.clickButton('Sign In')
        await page.waitForText('Password')
        await page.fillPlaceholder('Email', peekEmail)
        await page.fillPlaceholder('Password', peekPassword)
        await page.clickDialogButton('Sign In')
        await page.waitForText(peekUsername)
        await page.clickButton(peekUsername)
        await page.clickMenuLink('Loadout')
        await page.waitForText("peek's Loadout")
        await page.waitForText('Generate your Read-out')
        await page.navigate(`http://127.0.0.1:${appPort}/user/${peekUsername}/loadout`)
        const library = readLibrary()
        await page.waitForText('Generate your Read-out')
        await page.waitForText(library.marker)
        await page.screenshot(join(dir, 'before.png'))
        page.armLoadoutCapture()
        await page.clickButton('Generate your Read-out')
        await page.waitForTextEither([
            "Couldn't generate right now. Try again shortly.",
            'Regenerate',
        ], 90_000)
        await page.screenshot(join(dir, 'after.png'))
        const bodyText = await page.bodyText()
        const api = page.loadoutCapture
        const row = readoutRow()
        await writeFile(join(dir, 'postgres.txt'), row + '\n')
        const paragraph = await page.readoutParagraph()
        const anthropicSet = Boolean(process.env.ANTHROPIC_API_KEY)
        const persisted = row.includes('loadout_identity=') && !row.includes('loadout_identity=<null>')
        const result = {
            feature: 'loadout-readout',
            catalogue: library.mode,
            marker: library.marker,
            anthropicApiKey: anthropicSet ? 'set' : 'unset',
            api,
            paragraph,
            pageShowsError: bodyText.includes("Couldn't generate right now"),
            pageShowsRegenerate: bodyText.includes('Regenerate'),
            postgres: row,
            persisted,
        }
        await writeFile(join(dir, 'result.json'), JSON.stringify(result, null, 2))
        if (!anthropicSet) {
            console.error('Blocked: ANTHROPIC_API_KEY is unset. The Generate click ran. users.loadout_identity stayed null because lib/loadout.ts has no stub provider.')
            code = 2
        } else if (!persisted || !paragraph) {
            console.error('Generate finished without a persisted paragraph. See result.json.')
            code = 1
        } else if (!bodyText.includes(paragraph)) {
            console.error('The page text does not include the paragraph stored expectation.')
            code = 1
        } else {
            log(`proved loadout-readout evidence ${dir}`)
        }
    } finally {
        page?.close()
        stopRecorded('chrome')
        if (chromePid) {
            try { process.kill(chromePid, 'SIGTERM') } catch { /* already stopped */ }
        }
    }
    process.exit(code)
}

async function launchChrome() {
    const dataDir = join(runDir, 'chrome-profile')
    await rm(dataDir, { recursive: true, force: true })
    await mkdir(dataDir, { recursive: true })
    return spawnLogged('chrome', 'google-chrome', [
        '--headless=new',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--window-size=1280,800',
        `--remote-debugging-port=9222`,
        `--user-data-dir=${dataDir}`,
        'about:blank',
    ], {})
}

async function connectChrome() {
    let list = []
    for (let attempt = 0; attempt < 40; attempt += 1) {
        try {
            const response = await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })
            if (response.ok) {
                list = [await response.json()]
                break
            }
        } catch { /* chrome still starting */ }
        try {
            const response = await fetch('http://127.0.0.1:9222/json/list')
            const pages = await response.json()
            if (pages.length) {
                list = pages
                break
            }
        } catch { /* not up */ }
        await new Promise((resolve) => setTimeout(resolve, 250))
    }
    if (!list[0]?.webSocketDebuggerUrl) throw new Error('Chrome DevTools did not open a page.')
    const ws = new WebSocket(list[0].webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve, { once: true })
        ws.addEventListener('error', reject, { once: true })
    })
    let nextId = 0
    const pending = new Map()
    const events = []
    ws.addEventListener('message', (event) => {
        const message = JSON.parse(event.data)
        if (message.id && pending.has(message.id)) {
            const waiter = pending.get(message.id)
            pending.delete(message.id)
            if (message.error) waiter.reject(new Error(JSON.stringify(message.error)))
            else waiter.resolve(message.result)
        } else if (message.method) {
            events.push(message)
        }
    })
    function send(method, params = {}) {
        const id = ++nextId
        return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject })
            ws.send(JSON.stringify({ id, method, params }))
        })
    }
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Network.enable')
    const loadoutCapture = { status: null, body: null }
    async function evaluate(expression) {
        const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
        if (result.exceptionDetails) {
            throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
        }
        return result.result?.value
    }
    async function navigate(url) {
        await send('Page.navigate', { url })
        await new Promise((resolve) => setTimeout(resolve, 300))
        const started = Date.now()
        while (Date.now() - started < 20_000) {
            const ready = await evaluate('document.readyState')
            if (ready === 'complete') return
            await new Promise((resolve) => setTimeout(resolve, 200))
        }
        throw new Error(`Navigation to ${url} did not finish`)
    }
    async function bodyText() {
        return evaluate('document.body ? document.body.innerText : ""')
    }
    async function waitForText(needle, timeoutMs = 20_000) {
        const started = Date.now()
        while (Date.now() - started < timeoutMs) {
            const text = await bodyText()
            if (text.includes(needle)) return
            await new Promise((resolve) => setTimeout(resolve, 200))
        }
        const text = await bodyText()
        throw new Error(`Timed out waiting for ${JSON.stringify(needle)}. Page text:\n${text.slice(0, 1200)}`)
    }
    async function waitForTextEither(needles, timeoutMs) {
        const started = Date.now()
        while (Date.now() - started < timeoutMs) {
            const text = await bodyText()
            if (needles.some((needle) => text.includes(needle))) return
            await new Promise((resolve) => setTimeout(resolve, 250))
        }
        const text = await bodyText()
        throw new Error(`Timed out waiting for one of ${needles.join(' | ')}.\n${text.slice(0, 1200)}`)
    }
    async function clickButton(name) {
        const outcome = await evaluate(`(() => {
            const buttons = [...document.querySelectorAll('button')]
            const visible = buttons.filter((item) => item.getClientRects().length > 0)
            const pool = visible.length ? visible : buttons
            const button = pool.find((item) => item.textContent.trim() === ${JSON.stringify(name)})
            if (!button) return 'missing'
            button.click()
            return 'clicked'
        })()`)
        if (outcome !== 'clicked') throw new Error(`Could not click button ${name}`)
    }
    async function clickTab(name) {
        const outcome = await evaluate(`(() => {
            const button = [...document.querySelectorAll('[role="tab"]')].find((item) => item.textContent.trim() === ${JSON.stringify(name)})
            if (!button) return 'missing'
            button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
            return 'clicked'
        })()`)
        if (outcome !== 'clicked') throw new Error(`Could not click tab ${name}`)
    }
    async function clickControl(name) {
        const outcome = await evaluate(`(() => {
            const nodes = [...document.querySelectorAll('button, [role="button"]')]
            const visible = nodes.filter((item) => item.getClientRects().length > 0)
            const pool = visible.length ? visible : nodes
            const node = pool.find((item) => item.textContent.trim() === ${JSON.stringify(name)})
            if (!node) return 'missing'
            node.click()
            return 'clicked'
        })()`)
        if (outcome !== 'clicked') throw new Error(`Could not click ${name}`)
    }
    async function panelText() {
        return evaluate(`(() => {
            const panel = document.querySelector('[role="tabpanel"][data-state="active"]')
            const root = panel || document.body
            return root.innerText || ''
        })()`)
    }
    async function controlInView(name) {
        return evaluate(`(() => {
            const root = document.querySelector('[role="tabpanel"][data-state="active"]') || document.body
            const nodes = [...root.querySelectorAll('button, [role="button"]')]
            return nodes.some((item) => item.textContent.trim() === ${JSON.stringify(name)}) ? 'yes' : 'no'
        })()`)
    }
    function eventMark() {
        return events.length
    }
    function requestUrlsSince(index) {
        return events.slice(index)
            .filter((item) => item.method === 'Network.requestWillBeSent')
            .map((item) => String(item.params?.request?.url || ''))
    }
    async function clickDialogButton(name) {
        const outcome = await evaluate(`(() => {
            const dialog = document.querySelector('[role="dialog"]')
            if (!dialog) return 'no-dialog'
            const button = [...dialog.querySelectorAll('button')].find((item) => item.textContent.trim() === ${JSON.stringify(name)})
            if (!button) return 'missing'
            button.click()
            return 'clicked'
        })()`)
        if (outcome !== 'clicked') throw new Error(`Could not click dialog button ${name} (${outcome})`)
    }
    async function clickLink(name) {
        const outcome = await evaluate(`(() => {
            const link = [...document.querySelectorAll('a')].find((item) => item.textContent.trim() === ${JSON.stringify(name)})
            if (!link) return 'missing'
            link.click()
            return 'clicked'
        })()`)
        if (outcome !== 'clicked') throw new Error(`Could not click link ${name}`)
    }
    async function clickSectionButton(heading) {
        const outcome = await evaluate(`(() => {
            const match = [...document.querySelectorAll('b')].find((item) => item.textContent.trim() === ${JSON.stringify(heading)})
            if (!match) return 'no-heading'
            const button = match.parentElement && match.parentElement.querySelector('button')
            if (!button) return 'no-button'
            button.click()
            return 'clicked'
        })()`)
        if (outcome !== 'clicked') throw new Error(`Could not click the button in ${heading} (${outcome})`)
    }
    async function clickPlaceholder(placeholder) {
        const outcome = await evaluate(`(() => {
            const dialog = document.querySelector('[role="dialog"]')
            const input = (dialog || document).querySelector(${JSON.stringify(`input[placeholder="${placeholder}"]`)})
            if (!input) return 'missing'
            input.click()
            return 'clicked'
        })()`)
        if (outcome !== 'clicked') throw new Error(`Could not click ${placeholder} (${outcome})`)
    }
    async function waitUntil(expression, timeoutMs = 20_000) {
        const started = Date.now()
        let last = ''
        while (Date.now() - started < timeoutMs) {
            last = await evaluate(expression)
            if (last === 'ok') return
            await new Promise((resolve) => setTimeout(resolve, 200))
        }
        const text = await bodyText()
        throw new Error(`Timed out waiting (${last}). Page text:\n${text.slice(0, 1200)}`)
    }
    async function clickMenuLink(name) {
        const started = Date.now()
        while (Date.now() - started < 8_000) {
            const outcome = await evaluate(`(() => {
                const menu = document.querySelector('[role="menu"]')
                if (!menu) return 'no-menu'
                const link = [...menu.querySelectorAll('a')].find((item) => item.textContent.trim() === ${JSON.stringify(name)})
                if (!link) return 'missing'
                link.click()
                return 'clicked'
            })()`)
            if (outcome === 'clicked') return
            await new Promise((resolve) => setTimeout(resolve, 200))
        }
        throw new Error(`Could not click menu link ${name}`)
    }
    async function setViewport(width, height) {
        await send('Emulation.setDeviceMetricsOverride', {
            width,
            height,
            deviceScaleFactor: 2,
            mobile: true,
        })
    }
    async function clickLabel(name) {
        const outcome = await evaluate(`(() => {
            const nodes = [...document.querySelectorAll('button, [role="button"], a, [role="link"]')]
            const visible = nodes.filter((item) => item.getClientRects().length > 0)
            const pool = visible.length ? visible : nodes
            const node = pool.find((item) => (item.getAttribute('aria-label') || '').trim() === ${JSON.stringify(name)})
            if (!node) return 'missing'
            node.click()
            return 'clicked'
        })()`)
        if (outcome !== 'clicked') throw new Error(`Could not click label ${name}`)
    }
    async function fillLabel(label, value) {
        const outcome = await evaluate(`(() => {
            const dialog = document.querySelector('[role="dialog"]')
            const root = dialog || document
            const nodes = [...root.querySelectorAll('input, textarea')]
            const visible = nodes.filter((item) => item.getClientRects().length > 0)
            const field = (visible.length ? visible : nodes).find((item) => item.getAttribute('aria-label') === ${JSON.stringify(label)})
            if (!field) return 'missing'
            const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
            const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
            setter.call(field, ${JSON.stringify(value)})
            field.dispatchEvent(new Event('input', { bubbles: true }))
            field.dispatchEvent(new Event('change', { bubbles: true }))
            return field.value
        })()`)
        if (outcome !== value) throw new Error(`Could not fill ${label} (${outcome})`)
    }
    function requestsSince(index) {
        return events.slice(index)
            .filter((item) => item.method === 'Network.requestWillBeSent')
            .map((item) => ({
                url: String(item.params?.request?.url || ''),
                method: String(item.params?.request?.method || ''),
                body: String(item.params?.request?.postData || ''),
            }))
    }
    async function fillPlaceholder(placeholder, value) {
        const outcome = await evaluate(`(() => {
            const dialog = document.querySelector('[role="dialog"]')
            const root = dialog || document
            const inputs = [...root.querySelectorAll(${JSON.stringify(`input[placeholder="${placeholder}"]`)})]
            const visible = inputs.filter((item) => item.getClientRects().length > 0)
            const input = (visible.length ? visible : inputs)[0]
            if (!input) return 'missing'
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
            setter.call(input, ${JSON.stringify(value)})
            input.dispatchEvent(new Event('input', { bubbles: true }))
            input.dispatchEvent(new Event('change', { bubbles: true }))
            return input.value
        })()`)
        if (outcome !== value) throw new Error(`Could not fill ${placeholder} (${outcome})`)
    }
    async function screenshot(path) {
        const shot = await send('Page.captureScreenshot', { format: 'png' })
        await writeFile(path, Buffer.from(shot.data, 'base64'))
    }
    let captureTimer = null
    let captureWatchdog = null
    function stopLoadoutCapture() {
        if (captureTimer) clearInterval(captureTimer)
        if (captureWatchdog) clearTimeout(captureWatchdog)
        captureTimer = null
        captureWatchdog = null
    }
    function armLoadoutCapture() {
        stopLoadoutCapture()
        captureTimer = setInterval(async () => {
            const event = events.find((item) => item.method === 'Network.responseReceived' && String(item.params?.response?.url || '').includes('/api/loadout'))
            if (!event || loadoutCapture.status) return
            loadoutCapture.status = event.params.response.status
            try {
                const body = await send('Network.getResponseBody', { requestId: event.params.requestId })
                loadoutCapture.body = body.base64Encoded ? Buffer.from(body.body, 'base64').toString() : body.body
            } catch (error) {
                loadoutCapture.body = error instanceof Error ? error.message : String(error)
            }
            stopLoadoutCapture()
        }, 200)
        captureWatchdog = setTimeout(() => stopLoadoutCapture(), 90_000)
    }
    function close() {
        stopLoadoutCapture()
        ws.close()
    }
    async function readoutParagraph() {
        return evaluate(`(() => {
            const node = document.querySelector('p.italic')
            return node ? node.textContent.trim().replace(/^“|”$/g, '') : ''
        })()`)
    }
    return {
        navigate, waitForText, waitForTextEither, waitUntil, clickButton, clickTab, clickControl, clickDialogButton, clickLink, clickMenuLink,
        clickSectionButton, clickPlaceholder, fillPlaceholder, clickLabel, fillLabel, setViewport, screenshot, bodyText, panelText, controlInView,
        eventMark, requestUrlsSince, requestsSince, evaluate, armLoadoutCapture, loadoutCapture, readoutParagraph, close,
    }
}

async function down() {
    for (const name of ['chrome', 'expo', 'next', 'gateway', 'postgrest']) stopRecorded(name)
    await new Promise((resolve) => setTimeout(resolve, 500))
    const state = await readState()
    try {
        sudoPsql(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`)
        log(`dropped ${dbName}`)
    } catch (error) {
        log(error instanceof Error ? error.message : String(error))
    }
    if (state?.createdAuthenticator) {
        try {
            sudoPsql(`
                REVOKE anon FROM authenticator;
                REVOKE authenticated FROM authenticator;
                DROP OWNED BY authenticator;
                DROP ROLE authenticator;
            `)
            log('dropped cluster role authenticator')
        } catch (error) {
            log(error instanceof Error ? error.message : String(error))
        }
    }
    const existing = readEnvFile()
    if (existing && existing.includes(envMarker)) {
        await rm(envPath, { force: true })
        log(`removed ${envPath}`)
    }
    if (existsSync(evidenceRoot)) log(`evidence kept at ${evidenceRoot}`)
    else log('no evidence directory to keep')
}

const command = process.argv[2]
if (command === 'up') await up()
else if (command === 'down') await down()
else if (command === 'doctor') await doctor()
else if (command === 'drive') await drive(process.argv[3])
else if (command === 'gateway') await gatewayChild()
else {
    fail('Usage: verify-screenpeak.mjs up|doctor|drive <feature>|down')
}
