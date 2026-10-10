const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1', '[::1]']

function parseDatabaseUrl(url: string): { host: string; name: string } {
    let parsed: URL
    try { parsed = new URL(url) }
    catch { throw new Error('Database URL is invalid.') }
    return { host: parsed.hostname, name: decodeURIComponent(parsed.pathname.replace(/^\//, '')) }
}

/** Refuse hosted and non-rehearsal databases. Callers must pass an explicit URL. */
export function assertDisposableDatabase(url: string): void {
    const { host, name } = parseDatabaseUrl(url)
    if (!LOCAL_HOSTS.includes(host))
        throw new Error('Refusing a non-local database. Restore a copy on localhost and rehearse there, or pass --target-hosted with --confirm-host and --confirm-database.')
    if (!name.endsWith('_test') && !name.endsWith('_copy'))
        throw new Error('Refusing a database whose name does not end in _test or _copy.')
}

export type DatabaseTarget = {
    targetHosted: boolean
    confirmHost?: string
    confirmDatabase?: string
    confirmLocalCopy: boolean
}

export function databaseTargetFromArgv(argv: string[]): DatabaseTarget {
    const argument = (name: string) => {
        const index = argv.indexOf(name)
        return index === -1 ? undefined : argv[index + 1]
    }
    return {
        targetHosted: argv.includes('--target-hosted'),
        confirmHost: argument('--confirm-host'),
        confirmDatabase: argument('--confirm-database'),
        confirmLocalCopy: argv.includes('--confirm-local-copy'),
    }
}

/** Local rehearsal stays on assertDisposableDatabase. Hosted mode requires the operator to type the URL's host and database name. */
export function assertDatabaseTarget(url: string, target: DatabaseTarget): void {
    if (target.targetHosted && target.confirmLocalCopy)
        throw new Error('--target-hosted and --confirm-local-copy are different targets. Pass --target-hosted with --confirm-host and --confirm-database only for the hosted database.')
    if (!target.targetHosted) {
        assertDisposableDatabase(url)
        return
    }
    const hostArg = target.confirmHost
    const nameArg = target.confirmDatabase
    if (!hostArg || !nameArg || hostArg.startsWith('--') || nameArg.startsWith('--'))
        throw new Error('--target-hosted requires --confirm-host and --confirm-database. Type the host and database name from the URL.')
    const { host, name } = parseDatabaseUrl(url)
    if (LOCAL_HOSTS.includes(host))
        throw new Error('--target-hosted refuses a local host. Rehearse on a local _copy without this flag.')
    if (hostArg !== host || nameArg !== name)
        throw new Error(`Refusing hosted target. Typed ${hostArg}/${nameArg} does not match the URL ${host}/${name}.`)
}

type MarkerSql = { unsafe: (query: string) => Promise<Record<string, unknown>[]> }

const SUPABASE_MARKERS = `select (
    exists (select 1 from information_schema.columns
        where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password')
    or exists (select 1 from pg_roles where rolname in ('supabase_admin', 'supabase_auth_admin', 'authenticator'))
    or exists (select 1 from pg_namespace where nspname in ('supabase_migrations', 'storage', 'vault', '_realtime'))
) as supabase`

async function supabaseMarkers(sql: MarkerSql): Promise<boolean> {
    const [row] = await sql.unsafe(SUPABASE_MARKERS)
    return Boolean(row?.supabase)
}

/** A localhost URL can still be a tunnel. Supabase markers require an explicit confirmation. */
export async function assertLocalCopy(sql: MarkerSql, confirmed: boolean): Promise<void> {
    if (await supabaseMarkers(sql) && !confirmed)
        throw new Error('This database has Supabase markers. A localhost URL can be a tunnel to the hosted project. Pass --confirm-local-copy only after you verify this is a restored copy, not a tunnel.')
}

/** Auth stubs replace auth.uid() and must never run against a real Supabase auth schema. */
export async function assertAuthStubSafe(sql: MarkerSql): Promise<void> {
    if (await supabaseMarkers(sql))
        throw new Error('--local-auth-stubs refuses a database that already has a Supabase auth schema. Use it only on empty local Postgres.')
}
