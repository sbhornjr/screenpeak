import { useRef, useState } from 'react'

import { useSingleFlight } from './single-flight'

type Action = { action: () => Promise<string | null>, onSuccess?: () => void }

/**
 * One write from a sheet: busy while it runs, the failure sentence after, and
 * Retry for a request that failed (not for a form check). A second tap while
 * the first runs is ignored.
 */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canRetry, setCanRetry] = useState(false)
  const last = useRef<Action | null>(null)
  const flight = useSingleFlight()

  function run(action: () => Promise<string | null>, onSuccess?: () => void) {
    return flight(async () => {
      last.current = { action, onSuccess }
      setCanRetry(false)
      setError(null)
      setBusy(true)
      try {
        const failure = await action()
        setError(failure)
        setCanRetry(failure != null)
        if (!failure) onSuccess?.()
      } finally {
        setBusy(false)
      }
    })
  }

  function retry() {
    if (last.current) void run(last.current.action, last.current.onSuccess)
  }

  /** A form check failed. No request ran, so there is nothing to retry. */
  function fail(message: string | null) {
    setCanRetry(false)
    setError(message)
  }

  return { busy, error, canRetry, run, retry, fail, clear: () => fail(null) }
}
