import type { SettingsData } from '@screenpeak/shared/api/me'
import type { ProfilePageData } from '@screenpeak/shared/api/profile'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { api, apiConfigured } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { avatarSteps } from '@/lib/avatar-picker'
import { changeAvatar } from '@/lib/avatar-upload'
import { useCachedWrite } from '@/lib/cached-write'
import { actionFailure } from '@/lib/failure'
import { back, go } from '@/lib/go'
import { queryKeys, scopes } from '@/lib/query-keys'
import { titleChoices, withPrivacy } from '@/lib/settings-page'
import { useRefresh } from '@/lib/use-refresh'

import { EmptyState } from '@/components/empty-state'
import { ScreenScroll, SignupButtons } from '@/components/screen-scroll'
import { RemoteGate, screenGate } from '@/components/screen-state'
import { SettingsScreen, SettingsSkeleton } from '@/components/settings-screen'

// Library and Loadout privacy show on the profile and the library; the default
// list privacy is the game page's Add to list default.
const PRIVACY_SCOPES = [scopes.profile, scopes.library, scopes.game]

export default function SettingsRoute() {
  const queryClient = useQueryClient()
  const auth = useAuth()
  const { ready, session } = auth
  const configured = apiConfigured()
  const viewerId = session?.user.id ?? null
  const settingsKey = queryKeys.settings(viewerId)
  const settings = useQuery({
    queryKey: settingsKey,
    queryFn: () => api.me.settings(),
    enabled: session != null && ready && configured,
  })
  const username = settings.data?.username ?? ''
  const profileKey = queryKeys.profile(username, viewerId)
  // The bio and the title choices come from the profile, as on the website.
  const profile = useQuery({
    queryKey: profileKey,
    queryFn: () => api.users.get(username),
    enabled: username.length > 0 && ready && configured,
  })
  const commitPrivacy = useCachedWrite<SettingsData>(settingsKey, { viewerId, invalidate: PRIVACY_SCOPES })
  const { refreshing, refresh } = useRefresh(settings.refetch, profile.refetch)

  if (ready && !session) {
    return (
      <ScreenScroll title="Settings" onBack={back}>
        <EmptyState dense title="Log in to change your settings." />
        <SignupButtons onOpen={go} />
      </ScreenScroll>
    )
  }
  const data = settings.data
  if (!data) {
    const gate = screenGate({ ready, configured, loading: settings.isLoading, error: settings.error })
    if (gate && gate.title !== 'Loading') return <RemoteGate gate={gate} onRetry={() => { void settings.refetch() }} />
    return <SettingsSkeleton onBack={back} />
  }

  // A write that changes what the profile, the tab bar's card, or the feed show.
  async function patched(write: () => Promise<unknown>, update?: (current: SettingsData) => SettingsData) {
    try {
      await write()
      if (update) queryClient.setQueryData<SettingsData>(settingsKey, current => current ? update(current) : current)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: settingsKey }),
        queryClient.invalidateQueries({ queryKey: queryKeys.me(viewerId) }),
        queryClient.invalidateQueries({ queryKey: scopes.profile }),
      ])
      return null
    } catch (error) {
      return actionFailure(error)
    }
  }

  // Nothing cached belongs to the next person on this phone.
  function leave() {
    queryClient.clear()
    go('/')
  }

  return (
    <SettingsScreen
      settings={data}
      bio={profile.data?.profile.user_bio ?? ''}
      titles={titleChoices(profile.data)}
      onBack={back}
      onChangePhoto={async () => {
        const outcome = await changeAvatar(avatarSteps)
        if (outcome.kind === 'failed') return outcome.message
        if (outcome.kind === 'canceled') return null
        void queryClient.invalidateQueries({ queryKey: scopes.feed })
        return patched(async () => undefined, current => ({ ...current, avatar_url: outcome.url }))
      }}
      onSaveTitle={title => patched(() => api.me.patch({ selectedTitle: title }), current => ({ ...current, selected_title: title }))}
      onSaveBio={bio => patched(async () => {
        await api.me.patch({ bio })
        queryClient.setQueryData<ProfilePageData>(profileKey, current => current
          ? { ...current, profile: { ...current.profile, user_bio: bio } }
          : current)
      })}
      onSaveUsername={async (next) => {
        try {
          await api.me.patch({ username: next })
          // Profile, library, list, and feed keys all carry usernames.
          await queryClient.invalidateQueries()
          return null
        } catch (error) {
          return actionFailure(error)
        }
      }}
      onChangeEmail={email => auth.changeEmail(email)}
      onChangePassword={(current, next, again) => auth.changePassword(current, next, again)}
      onPrivacy={(type, value) => commitPrivacy(
        () => api.me.patch({ privacy: { type, public: value } }),
        current => withPrivacy(current, type, value),
      )}
      onSignOut={async () => {
        try {
          await auth.signOut()
        } catch (error) {
          return actionFailure(error)
        }
        leave()
        return null
      }}
      onDeleteAccount={async () => {
        try {
          await api.me.deleteAccount()
        } catch (error) {
          return actionFailure(error)
        }
        // The account is gone, so Auth has no session to end; drop it here.
        await auth.forgetSession()
        leave()
        return null
      }}
      refreshing={refreshing}
      onRefresh={refresh}
      refreshError={settings.isRefetchError ? actionFailure(settings.error) : null}
      onRetry={() => { void settings.refetch() }}
    />
  )
}
