import type { ExplorePageData, ExploreRange } from '@screenpeak/shared/api/explore'
import { useQuery } from '@tanstack/react-query'
import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'

import { api, apiConfigured } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useCachedWrite } from '@/lib/cached-write'
import { withExploreListLike } from '@/lib/explore-page'
import { searchTypeParam, useExploreSearch, type SearchType } from '@/lib/explore-search'
import { actionFailure } from '@/lib/failure'
import { go } from '@/lib/go'
import { keepSameScope, queryKeys, scopes } from '@/lib/query-keys'
import { useRefresh } from '@/lib/use-refresh'
import { useRemote } from '@/lib/use-remote'

import { ExploreScreen, ExploreSkeleton } from '@/components/explore-screen'
import { RemoteGate, screenGate } from '@/components/screen-state'

// A like reloads the lists screens and Explore itself once it lands.
const LIKE_SCOPES = [scopes.lists, scopes.explore]

export default function ExploreRoute() {
  const { ready, session } = useAuth()
  const configured = apiConfigured()
  const viewerId = session?.user.id ?? null
  const [range, setRange] = useState<ExploreRange>('week')
  // `/explore?type=users` (the empty feed's link) preselects the filter, on mount
  // and when the tab is already open.
  const { type: typeParam } = useLocalSearchParams<{ type?: string }>()
  const [searchType, setSearchType] = useState<SearchType>(() => searchTypeParam(typeParam) ?? 'games')
  const [linkedType, setLinkedType] = useState(typeParam)
  if (typeParam !== linkedType) {
    setLinkedType(typeParam)
    const linked = searchTypeParam(typeParam)
    if (linked) setSearchType(linked)
  }
  const [searchQuery, setSearchQuery] = useState<string | null>(null)
  // Another range keeps this one on screen until it loads.
  const page = useQuery({
    queryKey: queryKeys.explore(range, viewerId),
    queryFn: () => api.explore.get(range),
    placeholderData: keepSameScope(scopes.explore, viewerId),
    enabled: ready && configured,
  })
  const facets = useRemote(queryKeys.browseFacets, () => api.games.list({ page: 1, pageSize: 1 }))
  const me = useRemote(queryKeys.me, () => api.me.get(), session != null)
  const search = useExploreSearch(searchType, searchQuery)
  const commit = useCachedWrite<ExplorePageData>(queryKeys.explore(range, viewerId), { viewerId, invalidate: LIKE_SCOPES })
  const { refreshing, refresh } = useRefresh(page.refetch, facets.query.refetch)

  const data = page.data
  if (!data) {
    const gate = screenGate({ ready, configured, loading: page.isLoading, error: page.error })
    if (gate && gate.title !== 'Loading') return <RemoteGate gate={gate} onRetry={() => { void page.refetch() }} />
    return <ExploreSkeleton />
  }
  return (
    <ExploreScreen
      data={data}
      range={range}
      genres={facets.query.data?.genres ?? []}
      platforms={facets.query.data?.platforms ?? []}
      searchType={searchType}
      onSearchType={setSearchType}
      results={search.results}
      searchedFor={searchQuery}
      searching={search.searching}
      searchError={search.error}
      onSearch={query => setSearchQuery(query || null)}
      onOpen={go}
      onRange={setRange}
      viewerUsername={me.query.data?.user?.username ?? null}
      onLike={viewerId ? (listId, liked) => commit(
        () => liked ? api.lists.like(listId) : api.lists.unlike(listId),
        current => withExploreListLike(current, listId, liked),
      ) : undefined}
      updating={page.isPlaceholderData}
      refreshing={refreshing}
      onRefresh={refresh}
      refreshError={page.isRefetchError ? actionFailure(page.error) : null}
      onRetry={() => { void page.refetch() }}
    />
  )
}
