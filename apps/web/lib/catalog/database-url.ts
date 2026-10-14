const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1', '[::1]']

const RETIRED_FLAGS = [
    '--stamp-baseline',
    '--through',
    '--local-auth-stubs',
    '--target-hosted',
    '--confirm-host',
    '--confirm-database',
    '--confirm-local-copy',
]

function parseDatabaseUrl(url: string): { host: string; name: string } {
    let parsed: URL
    try { parsed = new URL(url) }
    catch { throw new Error('Database URL is invalid.') }
    return { host: parsed.hostname, name: decodeURIComponent(parsed.pathname.replace(/^\//, '')) }
}

/** Refuse a hosted URL and any database that is not a local disposable copy. */
export function assertDisposableDatabase(url: string): void {
    const { host, name } = parseDatabaseUrl(url)
    if (!LOCAL_HOSTS.includes(host))
        throw new Error('Refusing a non-local database. Point this command at a local database whose name ends in _test or _copy.')
    if (!name.endsWith('_test') && !name.endsWith('_copy'))
        throw new Error('Refusing a database whose name does not end in _test or _copy.')
}

/** The hosted cutover flags are gone. A leftover command must fail before it connects. */
export function refuseRetiredFlags(argv: string[]): void {
    const found = RETIRED_FLAGS.find(flag => argv.includes(flag))
    if (found)
        throw new Error(`${found} was removed after the hosted catalogue cutover. These commands only accept a local _test or _copy database. See docs/igdb.md.`)
}
