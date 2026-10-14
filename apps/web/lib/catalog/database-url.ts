const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1', '[::1]']

const RETIRED_FLAGS = [
    '--stamp-baseline',
    '--through',
    '--local-auth-stubs',
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

/** Stamp, partial apply, and the local-copy rehearsal flag are gone. */
export function refuseRetiredFlags(argv: string[]): void {
    const found = RETIRED_FLAGS.find(flag => argv.includes(flag))
    if (found)
        throw new Error(`${found} was removed after the hosted catalogue cutover. See docs/igdb.md.`)
}

export type DatabaseTarget = {
    targetHosted: boolean
    confirmHost?: string
    confirmDatabase?: string
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
    }
}

/**
 * Local databases stay on assertDisposableDatabase.
 * Hosted apply requires the operator to type the URL's host and database name.
 */
export function assertDatabaseTarget(url: string, target: DatabaseTarget): void {
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
        throw new Error('--target-hosted refuses a local host. Use a local _test or _copy database without this flag.')
    if (hostArg !== host || nameArg !== name)
        throw new Error(`Refusing hosted target. Typed ${hostArg}/${nameArg} does not match the URL ${host}/${name}.`)
}
