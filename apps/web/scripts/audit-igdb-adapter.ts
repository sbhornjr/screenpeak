// Run with node --conditions=react-server --import tsx (server-only modules).
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { config } from 'dotenv'
import { AuditError, parseSteamInput } from './igdb-audit'
import { IgdbError } from '../lib/igdb/http'

async function main() {
    const { values } = parseArgs({ options: {
        input: { type: 'string' }, output: { type: 'string' }, 'budget-db-env': { type: 'string' }, help: { type: 'boolean', short: 'h' },
    }, strict: true, allowPositionals: false })
    if (values.help) {
        console.log('Audit the production IGDB adapter against a Steam JSON file.\n--input FILE --output NEW_FILE --budget-db-env TEST_DATABASE_URL|DATABASE_POOL_URL\nThe selected database must have 0003 applied; only private request-budget state is written. No catalogue/user writes. For tests use a disposable local database. Never run the migration chain blindly against an existing Supabase database.')
        return
    }
    if (!values.input || !values.output || !['TEST_DATABASE_URL', 'DATABASE_POOL_URL'].includes(values['budget-db-env'] ?? ''))
        throw new AuditError('Specify --input, --output and explicit --budget-db-env TEST_DATABASE_URL or DATABASE_POOL_URL.')
    config({ path: resolve(__dirname, '../.env.local'), quiet: true })
    const budgetUrl = process.env[values['budget-db-env']!]
    if (!budgetUrl) throw new AuditError('Selected budget database environment variable is missing.')
    if (values['budget-db-env'] === 'TEST_DATABASE_URL') {
        const url = new URL(budgetUrl)
        if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !url.pathname.endsWith('_test'))
            throw new AuditError('TEST_DATABASE_URL must select a disposable local database ending in _test.')
    }
    process.env.DATABASE_POOL_URL = budgetUrl
    const base = process.env.INIT_CWD ?? process.cwd()
    const input = parseSteamInput(JSON.parse(await readFile(resolve(base, values.input), 'utf8')))
    const { createTokenManager } = await import('../lib/igdb/auth')
    const { createIgdbClient } = await import('../lib/igdb/client')
    const { createIgdbProvider } = await import('../lib/igdb/provider')
    let authRequests = 0
    const clientId = process.env.TWITCH_CLIENT_ID ?? ''
    const auth = createTokenManager({ clientId, clientSecret: process.env.TWITCH_CLIENT_SECRET ?? '', fetcher: async (...args) => { authRequests++; return fetch(...args) } })
    const client = createIgdbClient({ clientId, auth })
    const provider = createIgdbProvider(client)
    try {
        const start = Date.now()
        const lookups = await provider.getLookups()
        const lookupMs = Date.now() - start, mappingStart = Date.now()
        const rows = await provider.lookupSteamApps(input.map(g => g.appid))
        const mappingMs = Date.now() - mappingStart, hydrationStart = Date.now()
        const ids = [...new Set(rows.flatMap(r => r.candidates))]
        const games = await provider.getGamesByIds(ids)
        const exactMatches = rows.filter(r => r.candidates.length === 1).length
        const report = {
            mode: 'production-adapter', generatedAt: new Date().toISOString(),
            summary: { total: rows.length, exactMatches, ambiguous: rows.filter(r => r.candidates.length > 1).length,
                unmatched: rows.filter(r => !r.candidates.length).length, errors: 0, metadataErrors: 0,
                coveragePercent: rows.length ? Math.round(exactMatches / rows.length * 10000) / 100 : null, normalizedGames: games.length },
            timing: { lookupMs, mappingMs, hydrationMs: Date.now() - hydrationStart, totalMs: Date.now() - start },
            requests: { authRequests, ...client.stats },
            resolvedLookups: { steam: lookups.steamSourceId, mainGame: lookups.mainGameTypeId, esrb: lookups.esrbOrganizationId, reddit: lookups.redditWebsiteTypeId },
            results: rows, games,
        }
        await writeFile(resolve(base, values.output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
        console.log(JSON.stringify({ summary: report.summary, timing: report.timing, requests: report.requests }, null, 2))
    } finally {
        // This standalone process owns its client; application callers never close the shared pool.
        const { db } = await import('../lib/db')
        await db.$client.end({ timeout: 2 })
    }
}
main().catch(error => {
    console.error(error instanceof AuditError || error instanceof IgdbError ? error.message : 'Adapter audit failed; check configuration and provider/budget availability. No complete report was produced.')
    process.exitCode = 1
})
