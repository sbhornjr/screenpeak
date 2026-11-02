import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { api, apiConfigured } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { actionFailure } from '@/lib/failure'
import { back, go } from '@/lib/go'
import { queryKeys, scopes } from '@/lib/query-keys'
import { SETTINGS_HREF } from '@/lib/routes'
import { importEntries } from '@/lib/steam-import'
import { useSteamImport } from '@/lib/use-steam-import'

import { EmptyState } from '@/components/empty-state'
import { ScreenScroll, SignupButtons } from '@/components/screen-scroll'
import { RemoteGate, screenGate } from '@/components/screen-state'
import { SettingsSkeleton } from '@/components/settings-screen'
import { SteamImportScreen, SteamImportUnlinked } from '@/components/steam-import-screen'

// An import changes what the library, the profile's counts, game pages, and
// the feed show.
const IMPORT_SCOPES = [scopes.library, scopes.profile, scopes.game, scopes.feed]

export default function SteamImportRoute() {
  const queryClient = useQueryClient()
  const { ready, session } = useAuth()
  const configured = apiConfigured()
  const viewerId = session?.user.id ?? null
  const settings = useQuery({
    queryKey: queryKeys.settings(viewerId),
    queryFn: () => api.me.settings(),
    enabled: session != null && ready && configured,
  })
  const linked = settings.data?.steam_linked === true
  const steam = useSteamImport(linked)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  if (ready && !session) {
    return (
      <ScreenScroll title="Import from Steam" onBack={back}>
        <EmptyState dense title="Log in to import your Steam games." />
        <SignupButtons onOpen={go} />
      </ScreenScroll>
    )
  }
  if (!settings.data) {
    const gate = screenGate({ ready, configured, loading: settings.isLoading, error: settings.error })
    if (gate && gate.title !== 'Loading') return <RemoteGate gate={gate} onRetry={() => { void settings.refetch() }} />
    return <SettingsSkeleton onBack={back} />
  }
  if (!linked) return <SteamImportUnlinked onBack={back} onOpenSettings={() => go(SETTINGS_HREF)} />

  async function importSelected() {
    setImporting(true)
    setImportError(null)
    try {
      await api.me.library.importSteam(importEntries(steam.entries))
    } catch (error) {
      setImportError(actionFailure(error))
      setImporting(false)
      return
    }
    await Promise.all(IMPORT_SCOPES.map(queryKey => queryClient.invalidateQueries({ queryKey })))
    setImporting(false)
    back()
  }

  return (
    <SteamImportScreen
      entries={steam.entries}
      line={steam.line}
      notice={steam.notice}
      error={importError ?? steam.error}
      matching={steam.matching}
      importing={importing}
      canRetryMatches={steam.canRetryMatches}
      onRetryMatches={steam.retryMatches}
      onToggle={steam.toggle}
      onEdit={steam.edit}
      onImport={() => { void importSelected() }}
      onBack={back}
    />
  )
}
