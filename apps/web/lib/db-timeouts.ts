type PoolTimeouts = {
    idle_in_transaction_session_timeout: number
    statement_timeout?: number
    lock_timeout?: number
}

type TimeoutEnv = { [name: string]: string | undefined }

function positiveMs(env: TimeoutEnv, name: string): number | undefined {
    const raw = env[name]
    if (!raw) return undefined
    const value = Number(raw)
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer (milliseconds).`)
    return value
}

/** Connection-level timeouts for the seed pool. The app leaves these unset. */
export function poolConnectionTimeouts(env: TimeoutEnv = process.env): PoolTimeouts {
    const connection: PoolTimeouts = { idle_in_transaction_session_timeout: 15_000 }
    const statement = positiveMs(env, 'SCREENPEAK_STATEMENT_TIMEOUT_MS')
    const lock = positiveMs(env, 'SCREENPEAK_LOCK_TIMEOUT_MS')
    if (statement) connection.statement_timeout = statement
    if (lock) connection.lock_timeout = lock
    return connection
}

export function applySeedPoolTimeouts(env: TimeoutEnv): void {
    env.SCREENPEAK_LOCK_TIMEOUT_MS ||= '5000'
    env.SCREENPEAK_STATEMENT_TIMEOUT_MS ||= '30000'
}
