#!/usr/bin/env node
// Local ScreenPeak verification harness. See SKILL.md in this directory.
import { spawn, spawnSync } from 'node:child_process'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
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
const catalogueTop = 100
const libraryPath = join(runDir, 'library.json')
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
        gameIds = psql(databaseUrl, `
            select g.id::text from games g
            join game_genres gg on gg.game_id = g.id
            where gg.genre_id = '${genreId}'
            order by g.name
            limit 5
        `, ['-tA']).split('\n').filter(Boolean)
    } else {
        gameIds = psql(databaseUrl, 'select id::text from games order by name limit 5', ['-tA']).split('\n').filter(Boolean)
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
                    sendJson(res, 200, sessionFor(row, secret, refreshTokens), originHeaders)
                    return
                }
                if (grant === 'refresh_token') {
                    const userId = refreshTokens.get(body.refresh_token)
                    if (!userId) {
                        sendJson(res, 400, { error: 'invalid_grant', error_description: 'Invalid refresh token', msg: 'Invalid refresh token' }, originHeaders)
                        return
                    }
                    const row = lookupPeek(peekEmail)
                    if (!row || row.id !== userId) {
                        sendJson(res, 400, { error: 'invalid_grant', msg: 'Invalid refresh token' }, originHeaders)
                        return
                    }
                    refreshTokens.delete(body.refresh_token)
                    sendJson(res, 200, sessionFor(row, secret, refreshTokens), originHeaders)
                    return
                }
                sendJson(res, 400, { error: 'unsupported_grant_type', msg: `Unsupported grant ${grant}` }, originHeaders)
                return
            }
            if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
                const token = bearer(req)
                const payload = token && verifyJwt(token, secret)
                if (!payload?.sub) {
                    sendJson(res, 401, { error: 'invalid_token', msg: 'Invalid token' }, originHeaders)
                    return
                }
                const row = lookupPeek(peekEmail)
                if (!row || row.id !== payload.sub) {
                    sendJson(res, 401, { error: 'invalid_token', msg: 'Invalid token' }, originHeaders)
                    return
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
        select g.name || chr(31) || d.name || chr(31) || coalesce(g.cover_image_url, '')
        from games g
        join ratings_reviews rr on rr.game_id = g.id
        join users u on u.id = rr.user_id
        join game_developers gd on gd.game_id = g.id
        join developers d on d.id = gd.developer_id
        where u.username = '${peekUsername}'
        order by g.slug
        limit 1
    `, ['-tA'])
    if (!line) throw new Error('peek has no rated game with a developer to search.')
    const [name, developer, cover] = line.split('\x1f')
    if (!name || !developer) throw new Error(`search target was incomplete: ${line}`)
    return { name, developer, cover: cover || null }
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

async function drive(feature) {
    if (feature === 'game-page') return driveGamePage()
    if (feature === 'read-endpoints') return driveReadEndpoints()
    if (feature === 'game-writes') return driveGameWrites()
    if (feature === 'search') return driveSearch()
    if (feature !== 'loadout-readout') fail(`Unknown feature ${feature || ''}. Mapped features: loadout-readout, game-page, read-endpoints, game-writes, search.`)
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
            const button = buttons.find((item) => item.textContent.trim() === ${JSON.stringify(name)})
            if (!button) return 'missing'
            button.click()
            return 'clicked'
        })()`)
        if (outcome !== 'clicked') throw new Error(`Could not click button ${name}`)
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
    async function fillPlaceholder(placeholder, value) {
        const outcome = await evaluate(`(() => {
            const dialog = document.querySelector('[role="dialog"]')
            const input = (dialog || document).querySelector(${JSON.stringify(`input[placeholder="${placeholder}"]`)})
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
        navigate, waitForText, waitForTextEither, waitUntil, clickButton, clickDialogButton, clickLink, clickMenuLink,
        clickSectionButton, clickPlaceholder, fillPlaceholder, screenshot, bodyText, armLoadoutCapture, loadoutCapture, readoutParagraph, close,
    }
}

async function down() {
    for (const name of ['chrome', 'next', 'gateway', 'postgrest']) stopRecorded(name)
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
