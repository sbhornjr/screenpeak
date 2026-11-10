import type { SteamImportBatch } from '@screenpeak/shared/api/steam'
import type { SteamLinkEntry } from '@screenpeak/shared/types'
import { useEffect, useRef, useState } from 'react'

import { api } from './api'
import { matchingLine, mergeEntries, runMatching, type SteamEditField, type SteamEdits } from './steam-import'

const LOADING_LINE = 'Loading your Steam library…'

/** The import screen's state: the batch loop runs while `enabled`, again on each retry. */
export function useSteamImport(enabled: boolean) {
  const [entries, setEntries] = useState<SteamLinkEntry[]>([])
  const [last, setLast] = useState<SteamImportBatch | null>(null)
  // The loop for `cycle` is running until it is the last one that finished.
  const [finished, setFinished] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retryable, setRetryable] = useState(0)
  const [cycle, setCycle] = useState(0)
  const edited = useRef<SteamEdits>(new Map())

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void runMatching({
      retry: cycle > 0,
      fetchBatch: body => api.me.steamImportBatch(body),
      onBatch: batch => {
        setEntries(previous => mergeEntries(previous, batch.entries, edited.current))
        setLast(batch)
        setRetryable(batch.retryableAppCount)
        setNotice(null)
      },
      onNotice: (message, count) => {
        setNotice(message)
        setRetryable(count)
      },
      sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
      cancelled: () => cancelled,
    }).then(outcome => {
      if (cancelled) return
      if (!outcome.ok) {
        setError(outcome.message)
        setRetryable(count => count > 0 ? count : 1)
      }
      setFinished(cycle)
    })
    return () => { cancelled = true }
  }, [enabled, cycle])

  function mark(gameId: string, field: SteamEditField) {
    const fields = edited.current.get(gameId) ?? new Set<SteamEditField>()
    fields.add(field)
    edited.current.set(gameId, fields)
  }

  const matching = enabled && finished !== cycle
  const remaining = last?.remaining ?? 0
  return {
    entries,
    matching,
    notice,
    error,
    line: last
      ? matchingLine({
          matching,
          matchedGameCount: last.matchedGameCount,
          remaining,
          totalApps: last.totalApps,
          unmatched: last.unmatchedAppCount,
          ambiguous: last.ambiguousAppCount,
        })
      : (matching ? LOADING_LINE : ''),
    // The website's rule for showing "Try the remaining matches again".
    canRetryMatches: notice != null || ((retryable > 0 || remaining > 0) && !matching),
    retryMatches() {
      setError(null)
      setNotice(null)
      setCycle(value => value + 1)
    },
    toggle(gameId: string) {
      mark(gameId, 'selected')
      setEntries(current => current.map(entry => entry.gameId === gameId ? { ...entry, selected: !entry.selected } : entry))
    },
    edit(next: SteamLinkEntry, fields: SteamEditField[]) {
      for (const field of fields) mark(next.gameId, field)
      setEntries(current => current.map(entry => entry.gameId === next.gameId ? next : entry))
    },
  }
}
