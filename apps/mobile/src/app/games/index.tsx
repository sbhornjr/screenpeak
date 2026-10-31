import type { TaxonomySearchTable } from '@screenpeak/shared/api/search'
import { useLocalSearchParams } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'

import { api } from '@/lib/api'
import {
  CATALOGUE_PAGE_SIZE,
  catalogueGames,
  catalogueQuery,
  type CatalogueQuery,
} from '@/lib/catalogue-page'
import { actionFailure } from '@/lib/failure'
import { nextNumberedPage } from '@/lib/paging'
import { back, go } from '@/lib/go'
import { keepSameScope, queryKeys, scopes } from '@/lib/query-keys'
import { useRefresh } from '@/lib/use-refresh'
import { useRemotePages } from '@/lib/use-remote'

import { CatalogueScreen, CatalogueSkeleton } from '@/components/catalogue-screen'
import { API_MISSING, ScreenNotice } from '@/components/screen-state'

const TAXONOMY_LIMIT = 10

export default function CatalogueRoute() {
  const params = useLocalSearchParams<Record<string, string | string[]>>()
  // The link's filters seed the screen. A new link (another genre) starts over;
  // changes made on the screen stay until then.
  const linked = useMemo(() => catalogueQuery(params), [params])
  const linkKey = JSON.stringify(linked)
  const [state, setState] = useState<{ linkKey: string, query: CatalogueQuery }>({ linkKey, query: linked })
  const query = state.linkKey === linkKey ? state.query : linked

  const pages = useRemotePages(
    viewer => queryKeys.catalogue(query, viewer),
    page => api.games.list({ ...query, page, pageSize: CATALOGUE_PAGE_SIZE }),
    nextNumberedPage,
    { firstPageParam: 1, placeholderData: viewer => keepSameScope(scopes.catalogue, viewer) },
  )
  const remote = pages.query
  const { refreshing, refresh } = useRefresh(remote.refetch)
  const games = useMemo(() => catalogueGames(remote.data?.pages ?? []), [remote.data])
  const searchTaxonomy = useCallback(async (table: TaxonomySearchTable, q: string) => {
    try {
      const page = await api.taxonomy.search(table, q, { limit: TAXONOMY_LIMIT })
      return { hits: page.results }
    } catch (error) {
      return { error: actionFailure(error) }
    }
  }, [])

  if (!pages.configured) return <ScreenNotice {...API_MISSING} onBack={back} />
  if (pages.gate?.retry) {
    return <ScreenNotice title={pages.gate.title} body={pages.gate.body} onBack={back} onRetry={() => { void remote.refetch() }} />
  }
  const first = remote.data?.pages[0]
  if (!first) return <CatalogueSkeleton onBack={back} />
  return (
    <CatalogueScreen
      games={games}
      total={first.total}
      query={query}
      facets={first}
      onQuery={next => setState({ linkKey, query: next })}
      onOpen={go}
      onBack={back}
      searchTaxonomy={searchTaxonomy}
      hasMore={remote.hasNextPage}
      loadingMore={remote.isFetchingNextPage}
      loadMoreError={remote.isFetchNextPageError ? actionFailure(remote.error) : null}
      onLoadMore={() => { void remote.fetchNextPage() }}
      refreshing={refreshing}
      onRefresh={refresh}
      refreshError={remote.isRefetchError ? actionFailure(remote.error) : null}
      onRetry={() => { void remote.refetch() }}
      updating={remote.isPlaceholderData}
    />
  )
}
