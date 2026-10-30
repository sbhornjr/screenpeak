// The local Auth/PostgREST stand-in on the gateway port, run as a detached child.
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import { databaseUrl, gatewayPort, postgrestPort, recoveryPath, scriptPath, signupPath } from './config.mjs'
import { psql } from './database.mjs'
import { pkceMatches, signJwt, verifyJwt } from './jwt.mjs'
import { fail, log, spawnLogged } from './runtime.mjs'

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

export async function forkGateway(secret) {
    return spawnLogged('gateway', process.execPath, [scriptPath, 'gateway'], {
        VERIFY_JWT_SECRET: secret,
        VERIFY_DATABASE_URL: databaseUrl,
    })
}

export async function gatewayChild() {
    const secret = process.env.VERIFY_JWT_SECRET
    if (!secret) fail('VERIFY_JWT_SECRET is required for the gateway child.')
    await startGateway(secret)
    log(`gateway listening on ${gatewayPort}`)
}
