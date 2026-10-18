import { useAuth } from '@/lib/auth'
import { api, apiConfigured } from '@/lib/api'
import { go } from '@/lib/go'
import { useRemote } from '@/lib/use-remote'

import { FeedScreen } from '@/components/feed-screen'
import { ScreenMessage } from '@/components/screen-state'

export default function FeedRoute() {
  const { ready, session } = useAuth()
  const configured = apiConfigured()
  const feed = useRemote(['feed'], () => api.feed.get(0), session != null)
  if (!ready) return <ScreenMessage title="Loading" />
  if (!session) return <FeedScreen signedIn={false} items={[]} onOpen={go} />
  if (!configured) {
    return <ScreenMessage title="API URL missing" body="Set EXPO_PUBLIC_API_URL to the ScreenPeak server." />
  }
  if (feed.gate || !feed.query.data) {
    const gate = feed.gate ?? { title: 'Loading', body: '', retry: false }
    return (
      <ScreenMessage
        title={gate.title}
        body={gate.body}
        onRetry={gate.retry ? () => { void feed.query.refetch() } : undefined}
      />
    )
  }
  return <FeedScreen signedIn items={feed.query.data.items} onOpen={go} />
}
