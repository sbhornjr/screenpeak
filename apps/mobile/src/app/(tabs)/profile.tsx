import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { go } from '@/lib/go'
import { queryKeys } from '@/lib/query-keys'
import { useRemote } from '@/lib/use-remote'

import { ProfileHubScreen } from '@/components/profile-hub-screen'
import { RemoteGate, ScreenMessage } from '@/components/screen-state'
import { EmptyState } from '@/components/empty-state'
import { ScreenScroll, SignupButtons } from '@/components/screen-scroll'

export default function ProfileRoute() {
  const { ready, session } = useAuth()
  const me = useRemote(queryKeys.me, () => api.me.get(), session != null)
  if (!ready) return <ScreenMessage title="Loading" />
  if (!session) {
    return (
      <ScreenScroll title="Profile">
        <EmptyState dense title="Sign up to see your loadout and lists." />
        <SignupButtons onOpen={go} />
      </ScreenScroll>
    )
  }
  if (me.gate || !me.query.data) return <RemoteGate gate={me.gate} onRetry={() => { void me.query.refetch() }} />
  const username = me.query.data.user?.username
  if (!username) return <ScreenMessage title="Couldn't load this screen" body="Not found." />
  return <ProfileHubScreen username={username} />
}
