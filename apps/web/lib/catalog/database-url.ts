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
