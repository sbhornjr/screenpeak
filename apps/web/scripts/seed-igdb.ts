import { assertDisposableDatabase } from '../lib/catalog/database-url'

const help = `Seed IGDB main games through the shared rate limiter and catalogue writer.

  --database-env NAME   Required. Localhost URL whose database name ends in _test or _copy.
                        The database must already have the IGDB request budget (0003) and catalogue preparation.
  --ids 1,2,3           Explicit IGDB ids. Non-main games are rejected and nothing is written.
  --top [N]             Top main games by rating_count, then rating, then id. N defaults to 2000 and must be 1–5000.

The script only upserts games. It does not clear library entries, reviews, lists, or accounts.
Twitch credentials (TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET) are read from the environment.
See docs/igdb-migration-runbook.md.`

function argument(name: string): string | undefined {
    const index = process.argv.indexOf(name)
    return index === -1 ? undefined : process.argv[index + 1]
}

const envName = argument('--database-env')
if (!envName || process.argv.includes('--help')) {
    console.log(help)
    process.exit(process.argv.includes('--help') ? 0 : 1)
}
const url = process.env[envName]
if (!url) throw new Error(`Set ${envName}. This command does not fall back to DATABASE_POOL_URL.`)
assertDisposableDatabase(url)
const idsArg = argument('--ids')
const top = process.argv.includes('--top')
if (idsArg && top) throw new Error('Pass either --ids or --top.')
if (!idsArg && !top) throw new Error('Pass --ids or --top.')
let limit = 2000
if (top) {
    const next = process.argv[process.argv.indexOf('--top') + 1]
    if (next && !next.startsWith('--')) limit = Number(next)
    if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new Error('--top must be an integer from 1 to 5000.')
}
const explicit = idsArg?.split(',').map(part => Number(part.trim())) ?? []
if (idsArg && explicit.some(id => !Number.isInteger(id) || id <= 0)) throw new Error('--ids must be positive integers.')

process.env.DATABASE_POOL_URL = url
const { db } = await import('../lib/db')
const { igdbProvider } = await import('../lib/igdb/provider')
const { seedCatalogGames } = await import('../lib/catalog/seed')
const ids = explicit.length ? explicit : await igdbProvider.listTopMainGameIds(limit)
const games = await igdbProvider.getGamesByIds(ids, { mainOnly: true })
const result = await seedCatalogGames(db, games)
console.log(JSON.stringify({ requested: ids.length, ...result }, null, 2))
