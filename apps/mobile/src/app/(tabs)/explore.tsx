import { useState } from 'react'
import type { ExploreRange } from '@screenpeak/shared/api/explore'

import { api } from '@/lib/api'
import { go } from '@/lib/go'
import { useRemote } from '@/lib/use-remote'

import { ExploreScreen } from '@/components/explore-screen'
import { messageOf, ScreenMessage } from '@/components/screen-state'

export default function ExploreRoute() {
  const [range, setRange] = useState<ExploreRange>('week')
  const [searchQuery, setSearchQuery] = useState<string | null>(null)
  const page = useRemote(
    ['explore', range],
    () => Promise.all([api.explore.get(range), api.games.list({ page: 1, pageSize: 1 })]),
    true,
  )
  const search = useRemote(
    ['game-search', searchQuery ?? ''],
    () => api.games.search(searchQuery ?? ''),
    searchQuery != null,
  )
  if (page.gate || !page.query.data) {
    const gate = page.gate ?? { title: 'Loading', body: '', retry: false }
    return (
      <ScreenMessage
        title={gate.title}
        body={gate.body}
        onRetry={gate.retry ? () => { void page.query.refetch() } : undefined}
      />
    )
  }
  const [explore, catalogue] = page.query.data
  return (
    <ExploreScreen
      data={explore}
      genres={catalogue.genres}
      platforms={catalogue.platforms}
      results={searchQuery ? (search.query.data?.games ?? null) : null}
      searching={searchQuery != null && search.query.isLoading}
      searchError={searchQuery && search.query.error ? messageOf(search.query.error) : null}
      onSearch={setSearchQuery}
      onOpen={go}
      onRange={setRange}
    />
  )
}
