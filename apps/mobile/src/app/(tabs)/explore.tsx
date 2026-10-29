import { useState } from 'react'
import type { ExploreRange } from '@screenpeak/shared/api/explore'

import { api } from '@/lib/api'
import { go } from '@/lib/go'
import { actionFailure } from '@/lib/failure'
import { queryKeys } from '@/lib/query-keys'
import { useRemote } from '@/lib/use-remote'

import { ExploreScreen } from '@/components/explore-screen'
import { RemoteGate } from '@/components/screen-state'

export default function ExploreRoute() {
  const [range, setRange] = useState<ExploreRange>('week')
  const [searchQuery, setSearchQuery] = useState<string | null>(null)
  const page = useRemote(
    viewer => queryKeys.explore(range, viewer),
    () => Promise.all([api.explore.get(range), api.games.list({ page: 1, pageSize: 1 })]),
    true,
  )
  const search = useRemote(
    viewer => queryKeys.gameSearch(searchQuery ?? '', viewer),
    () => api.games.search(searchQuery ?? ''),
    searchQuery != null,
  )
  if (page.gate || !page.query.data) return <RemoteGate gate={page.gate} onRetry={() => { void page.query.refetch() }} />
  const [explore, catalogue] = page.query.data
  return (
    <ExploreScreen
      data={explore}
      genres={catalogue.genres}
      platforms={catalogue.platforms}
      results={searchQuery ? (search.query.data?.games ?? null) : null}
      searching={searchQuery != null && search.query.isLoading}
      searchError={searchQuery && search.query.error ? actionFailure(search.query.error) : null}
      onSearch={setSearchQuery}
      onOpen={go}
      onRange={setRange}
    />
  )
}
