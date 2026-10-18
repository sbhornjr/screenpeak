import { api, apiConfigured } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { go } from '@/lib/go'
import { useRemote } from '@/lib/use-remote'

import { ProfileHubScreen } from '@/components/profile-hub-screen'
import { ScreenMessage } from '@/components/screen-state'
import { EmptyState } from '@/components/empty-state'
import { ScreenScroll, SignupButtons } from '@/components/screen-scroll'

export default function ProfileRoute() {
  const { ready, session } = useAuth()
  const configured = apiConfigured()
  const me = useRemote(['me'], () => api.me.get(), session != null)
  if (!ready) return <ScreenMessage title="Loading" />
  if (!session) {
    return (
      <ScreenScroll title="Profile">
        <EmptyState dense title="Sign up to see your loadout and lists." />
        <SignupButtons onOpen={go} />
      </ScreenScroll>
    )
  }
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
  const username = me.query.data.user?.username
  if (!username) return <ScreenMessage title="Couldn't load this screen" body="Not found." />
  return <ProfileHubScreen username={username} />
}
