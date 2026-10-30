// up, doctor, and down: the lifecycle of the local stack.
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { startNext } from './apps.mjs'
import {
    appPort, authenticatorPassword, databaseUrl, dbName, envMarker, envPath, evidenceRoot, gatewayPort,
    peekUsername, postgrestPort, postgrestUrl, postgrestVersion, runDir,
} from './config.mjs'
import { applyLocalAppSql, applyMigrations, ensurePostgres, psql, seedCatalogue, sudoPsql } from './database.mjs'
import { readEnvFile, twitchReady, writeEnv } from './env.mjs'
import { forkGateway } from './gateway.mjs'
import {
    fail, log, pidAlive, portOpen, readPid, readState, spawnLogged, stopRecorded, waitForHttp, writeState,
} from './runtime.mjs'

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

export async function up() {
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
    const nextPid = startNext()
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

export async function doctor() {
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

export async function down() {
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
