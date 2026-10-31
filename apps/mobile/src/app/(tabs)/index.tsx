import { useMemo } from 'react'

import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { actionFailure } from '@/lib/failure'
import { feedItems, nextFeedOffset } from '@/lib/feed-page'
import { go } from '@/lib/go'
import { queryKeys } from '@/lib/query-keys'
import { useRefresh } from '@/lib/use-refresh'
import { useRemotePages } from '@/lib/use-remote'

import { FeedScreen, FeedSkeleton } from '@/components/feed-screen'
import { API_MISSING, ScreenMessage } from '@/components/screen-state'

export default function FeedRoute() {
  const { ready, session } = useAuth()
  const feed = useRemotePages(queryKeys.feed, offset => api.feed.get(offset), nextFeedOffset, { enabled: session != null })
  const { query } = feed
  const { refreshing, refresh } = useRefresh(query.refetch)
  const items = useMemo(() => feedItems(query.data?.pages ?? []), [query.data])

  if (!ready) return <FeedSkeleton />
  if (!session) return <FeedScreen signedIn={false} items={[]} onOpen={go} />
  if (!feed.configured) return <ScreenMessage {...API_MISSING} />
  if (feed.gate?.retry) {
    return <ScreenMessage title={feed.gate.title} body={feed.gate.body} onRetry={() => { void query.refetch() }} />
  }
  if (feed.gate || !query.data) return <FeedSkeleton />
  return (
    <FeedScreen
      signedIn
      items={items}
      now={query.dataUpdatedAt}
      onOpen={go}
      hasMore={query.hasNextPage}
      loadingMore={query.isFetchingNextPage}
      loadMoreError={query.isFetchNextPageError ? actionFailure(query.error) : null}
      onLoadMore={() => { void query.fetchNextPage() }}
      refreshing={refreshing}
      onRefresh={refresh}
      refreshError={query.isRefetchError ? actionFailure(query.error) : null}
      onRetry={() => { void query.refetch() }}
    />
  )
}
