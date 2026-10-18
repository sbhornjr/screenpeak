import { useQuery } from '@tanstack/react-query'

import { apiConfigured } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { screenGate } from '@/components/screen-state'

export function useRemote<T>(key: readonly unknown[], queryFn: () => Promise<T>, enabled = true) {
  const { ready, session } = useAuth()
  const configured = apiConfigured()
  const query = useQuery({
    queryKey: [...key, session?.user.id ?? null],
    queryFn,
    enabled: enabled && ready && configured,
  })
  const gate = screenGate({
    ready,
    configured,
    loading: enabled && query.isLoading,
    error: enabled ? query.error : null,
  })
  return {
    query,
    gate,
    ready,
    configured,
    session,
    signedIn: session != null,
  }
}
