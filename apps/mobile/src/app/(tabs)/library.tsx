import { api, apiConfigured } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { go } from '@/lib/go'
import { useRemote } from '@/lib/use-remote'

import { LibraryScreen } from '@/components/library-screen'
import { ScreenMessage } from '@/components/screen-state'

export default function LibraryRoute() {
  const { ready, session } = useAuth()
  const configured = apiConfigured()
  const me = useRemote(['me'], () => api.me.get(), session != null)
  const username = me.query.data?.user?.username ?? ''
  const library = useRemote(
    ['library', username],
    () => api.users.library(username),
    session != null && username.length > 0,
  )
  if (!ready) return <ScreenMessage title="Loading" />
  if (!session) return <LibraryScreen locked games={[]} onOpen={go} />
  if (!configured) {
    return <ScreenMessage title="API URL missing" body="Set EXPO_PUBLIC_API_URL to the ScreenPeak server." />
  }
  if (me.gate || !me.query.data) {
    const gate = me.gate ?? { title: 'Loading', body: '', retry: false }
    return (
      <ScreenMessage
        title={gate.title}
        body={gate.body}
        onRetry={gate.retry ? () => { void me.query.refetch() } : undefined}
      />
    )
  }
  if (!username) return <ScreenMessage title="Couldn't load this screen" body="Not found." />
  if (library.gate || !library.query.data) {
    const gate = library.gate ?? { title: 'Loading', body: '', retry: false }
    return (
      <ScreenMessage
        title={gate.title}
        body={gate.body}
        onRetry={gate.retry ? () => { void library.query.refetch() } : undefined}
      />
    )
  }
  return <LibraryScreen locked={false} games={library.query.data.games} onOpen={go} />
}
