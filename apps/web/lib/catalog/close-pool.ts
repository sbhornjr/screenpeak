import { formatSeedProgress } from './seed-progress'

type Pool = { end: (options?: { timeout?: number }) => Promise<void> }

/**
 * postgres.js `end()` waits for open queries. A seed that has already printed
 * its summary must still exit if that wait never finishes, and a SIGINT
 * handler must not depend on an unref'd timer that a quiet event loop can ignore.
 */
export function closeDatabasePool(pool: Pool | undefined, options: {
    code: number
    timeoutMs?: number
    exit?: (code: number) => void
    log?: (line: string) => void
    now?: () => number
}): Promise<void> {
    const timeoutMs = options.timeoutMs ?? 5_000
    const exit = options.exit ?? (code => process.exit(code))
    const log = options.log ?? (line => console.error(line))
    const now = options.now ?? (() => performance.now())
    const started = now()
    log(formatSeedProgress({ phase: 'closing-pool' }))
    return new Promise(resolve => {
        let done = false
        const stop = (forced: boolean) => {
            if (done) return
            done = true
            clearTimeout(force)
            log(formatSeedProgress(forced
                ? { phase: 'pool-close-forced' }
                : { phase: 'pool-closed', ms: Math.max(0, Math.round(now() - started)) }))
            const hard = setTimeout(() => {
                exit(options.code)
                resolve()
            }, 1_000)
            const exitNow = () => {
                clearTimeout(hard)
                exit(options.code)
                resolve()
            }
            if (process.stdout.write('')) exitNow()
            else process.stdout.once('drain', exitNow)
        }
        const force = setTimeout(() => stop(true), timeoutMs)
        if (!pool) {
            stop(false)
            return
        }
        void Promise.resolve(pool.end({ timeout: 2 })).then(() => stop(false), () => stop(false))
    })
}

export async function endDatabaseClient(client: Pool, timeoutMs = 5_000): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const expired = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('The database connection did not close. Stop other sessions and retry.')), timeoutMs)
    })
    try {
        await Promise.race([client.end({ timeout: 2 }).then(() => undefined, () => undefined), expired])
    } finally {
        clearTimeout(timer)
    }
}
