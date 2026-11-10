import { useLocalSearchParams } from 'expo-router'
import { useMemo, useState } from 'react'

import { api } from '@/lib/api'
import { actionFailure } from '@/lib/failure'
import { back, go } from '@/lib/go'
import { nextNumberedPage } from '@/lib/paging'
import { keepSameScope, queryKeys, scopes } from '@/lib/query-keys'
import { RATINGS_PAGE_SIZE, RATINGS_QUERY, ratingsItems, type RatingsQuery } from '@/lib/ratings-page'
import { useRefresh } from '@/lib/use-refresh'
import { useRemotePages } from '@/lib/use-remote'

import { RatingsScreen, RatingsSkeleton } from '@/components/ratings-screen'
import { API_MISSING, ScreenMessage, ScreenNotice } from '@/components/screen-state'

export default function RatingsRoute() {
  const params = useLocalSearchParams<{ username: string }>()
  const username = typeof params.username === 'string' ? params.username : ''
  const [query, setQuery] = useState<RatingsQuery>(RATINGS_QUERY)
  const pages = useRemotePages(
    viewer => queryKeys.ratings(username, query, viewer),
    page => api.users.reviews(username, { ...query, page, pageSize: RATINGS_PAGE_SIZE }),
    nextNumberedPage,
    {
      enabled: username.length > 0,
      firstPageParam: 1,
      // Another Show or Sort keeps this player's rows on screen until it loads.
      placeholderData: viewer => keepSameScope([...scopes.ratings, username], viewer),
    },
  )
  const remote = pages.query
  const { refreshing, refresh } = useRefresh(remote.refetch)
  const items = useMemo(() => ratingsItems(remote.data?.pages ?? []), [remote.data])

  if (!username) return <ScreenMessage title="Missing player" body="This link does not include a player." />
  if (!pages.configured) return <ScreenNotice {...API_MISSING} onBack={back} />
  if (pages.gate?.retry) {
    return <ScreenNotice title={pages.gate.title} body={pages.gate.body} onBack={back} onRetry={() => { void remote.refetch() }} />
  }
  const first = remote.data?.pages[0]
  if (!first) return <RatingsSkeleton onBack={back} />
  return (
    <RatingsScreen
      username={first.username}
      counts={first.counts}
      items={items}
      query={query}
      onQuery={setQuery}
      onOpen={go}
      onBack={back}
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
