import { useState } from 'react'

/** Pull-to-refresh state: `refreshing` stays on until every refetch settles. */
export function useRefresh(...refetches: (() => Promise<unknown>)[]) {
  const [refreshing, setRefreshing] = useState(false)
  async function refresh() {
    setRefreshing(true)
    try {
      await Promise.all(refetches.map(refetch => refetch()))
    } finally {
      setRefreshing(false)
    }
  }
  return { refreshing, refresh: () => { void refresh() } }
}
