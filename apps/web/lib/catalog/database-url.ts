/** Refuse hosted and non-rehearsal databases. Callers must pass an explicit URL. */
export function assertDisposableDatabase(url: string): void {
    let parsed: URL
    try { parsed = new URL(url) }
    catch { throw new Error('Database URL is invalid.') }
    const host = parsed.hostname
    if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host))
        throw new Error('Refusing a non-local database. Restore a copy on localhost and rehearse there.')
    const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
    if (!name.endsWith('_test') && !name.endsWith('_copy'))
        throw new Error('Refusing a database whose name does not end in _test or _copy.')
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
