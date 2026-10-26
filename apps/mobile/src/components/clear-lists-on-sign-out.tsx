import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { useAuth } from '@/lib/auth'

/** Drop list caches when the session ends, so the next account cannot see them. */
export function ClearListsOnSignOut() {
  const { session, ready } = useAuth()
  const client = useQueryClient()
  const signedIn = useRef(false)

  useEffect(() => {
    if (!ready) return
    const now = session != null
    if (signedIn.current && !now) client.removeQueries({ queryKey: ['lists'] })
    signedIn.current = now
  }, [session, ready, client])

  return null
}
