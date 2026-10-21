import { useRef } from 'react'

/**
 * Ignore a second call that starts before the first one finishes.
 * The lock is taken synchronously, before `action` awaits.
 * A `key` lets a different call start (a new search) while the same key stays one request.
 */
export function useSingleFlight() {
  const pending = useRef<string | boolean>(false)
  return function flight<T>(action: () => Promise<T>, key?: string): Promise<T | undefined> {
    const token: string | boolean = key ?? true
    if (pending.current === token) return Promise.resolve(undefined)
    pending.current = token
    return action().finally(() => {
      if (pending.current === token) pending.current = false
    })
  }
}
