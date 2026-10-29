import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'
import { go } from '@/lib/go'
import { queryKeys } from '@/lib/query-keys'
import { useRemote } from '@/lib/use-remote'

import { FeedScreen } from '@/components/feed-screen'
import { RemoteGate, ScreenMessage } from '@/components/screen-state'

export default function FeedRoute() {
  const { ready, session } = useAuth()
  const feed = useRemote(queryKeys.feed, () => api.feed.get(0), session != null)
  if (!ready) return <ScreenMessage title="Loading" />
  if (!session) return <FeedScreen signedIn={false} items={[]} onOpen={go} />
  if (feed.gate || !feed.query.data) return <RemoteGate gate={feed.gate} onRetry={() => { void feed.query.refetch() }} />
  return <FeedScreen signedIn items={feed.query.data.items} onOpen={go} />
}
