import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { config } from 'dotenv'
import { AuditError, IgdbAuditClient, auditMainGames, auditSteam, parseSteamInput } from './igdb-audit'

const HELP = `IGDB read-only catalogue audit

npm run audit:igdb -w @screenpeak/web -- --appids 292030,1145360
npm run audit:igdb -w @screenpeak/web -- --input /absolute/path/steam-library.json --output /absolute/path/report.json
npm run audit:igdb -w @screenpeak/web -- --main-games 20

Choose exactly one: --input FILE, --appids COMMA_SEPARATED_IDS, --main-games 1..100.
Input accepts [{ appid, name? }] or a Steam GetOwnedGames response.
TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET come from apps/web/.env.local or environment.
Paths resolve from the directory where npm was invoked. Reports never overwrite existing files.
Without --output, JSON goes to stdout. No database access or catalogue writes.
Run one audit at a time with these credentials; rate limiting is per process.
`

async function main() {
    const { values } = parseArgs({ options: {
        input: { type: 'string' }, appids: { type: 'string' }, 'main-games': { type: 'string' },
        output: { type: 'string' }, help: { type: 'boolean', short: 'h' },
    }, strict: true, allowPositionals: false })
    if (values.help) { console.log(HELP); return }
    if ([values.input, values.appids, values['main-games']].filter(v => v !== undefined).length !== 1)
        throw new AuditError('Choose exactly one of --input, --appids or --main-games. Use --help for examples.')
    // __dirname is the script directory under the repository's tsx/CommonJS execution.
    config({ path: resolve(__dirname, '../.env.local'), quiet: true })
    const base = process.env.INIT_CWD ?? process.cwd()
    let input
    if (values.input !== undefined) {
        let data: unknown
        try { data = JSON.parse(await readFile(resolve(base, values.input), 'utf8')) }
        catch { throw new AuditError('Could not read --input as JSON.') }
        input = parseSteamInput(data)
    } else if (values.appids !== undefined) {
        if (!/^[0-9]+(,[0-9]+)*$/.test(values.appids)) throw new AuditError('--appids must be comma-separated positive integer IDs.')
        input = parseSteamInput(values.appids.split(',').map(id => ({ appid: Number(id) })))
    }
    const limit = values['main-games'] === undefined ? undefined : Number(values['main-games'])
    if (limit !== undefined && (!/^[0-9]+$/.test(values['main-games']!) || limit < 1 || limit > 100))
        throw new AuditError('--main-games must be between 1 and 100.')
    const client = new IgdbAuditClient(process.env.TWITCH_CLIENT_ID ?? '', process.env.TWITCH_CLIENT_SECRET ?? '')
    const report = input ? await auditSteam(client, input) : await auditMainGames(client, limit!)
    const serialized = JSON.stringify(report, null, 2) + '\n'
    if (values.output) {
        try { await writeFile(resolve(base, values.output), serialized, { flag: 'wx', mode: 0o600 }) }
        catch { throw new AuditError('Could not create --output. Its parent directory must exist and the file must not already exist.') }
        console.error('Audit report saved.')
    } else process.stdout.write(serialized)
    if (report.mode === 'steam' && (report.summary.errors || report.summary.metadataErrors)) process.exitCode = 2
}
main().catch(error => {
    console.error(error instanceof AuditError ? error.message : 'Audit failed. Check arguments and environment; use --help for usage.')
    process.exitCode = 1
})
