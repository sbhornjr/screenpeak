import type { LibraryPageData, LibraryQuery } from '@screenpeak/shared/api/library'
import type { LibraryWrite } from '@screenpeak/shared/api/writes'
import { ApiClientError } from '@screenpeak/shared/api/client'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { api, apiConfigured } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { actionFailure } from '@/lib/game-page'
import { back, go } from '@/lib/go'
import {
  applyLibraryWrite,
  LIBRARY_QUERY,
  libraryCacheParts,
  withoutLibraryGame,
} from '@/lib/library-page'
import { loadProfileHub } from '@/lib/profile-hub'
import { useRemote } from '@/lib/use-remote'
import { colors } from '@/theme'

import { AppHeader } from './app-header'
import { LibraryScreen, LibrarySkeleton } from './library-screen'
import { ScreenMessage } from './screen-state'

function libraryFailure(error: unknown): { title: string, body: string } {
  if (error instanceof ApiClientError && error.status === 429) {
    return { title: 'Too many requests', body: actionFailure(error) }
  }
  return { title: "Couldn't load this screen", body: actionFailure(error) }
}

function LibraryNotice({
  title,
  body,
  onRetry,
  onBack,
}: {
  title: string
  body: string
  onRetry?: () => void
  onBack?: () => void
}) {
  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader onBack={onBack} />
      <View style={styles.notice}>
        <ScreenMessage title={title} body={body} onRetry={onRetry} />
      </View>
    </SafeAreaView>
  )
}

export function LibraryBrowser({
  username,
  canEdit,
  title,
  onBack,
}: {
  username: string
  canEdit: boolean
  title: string
  onBack?: () => void
}) {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState<LibraryQuery>(LIBRARY_QUERY)
  const [refreshing, setRefreshing] = useState(false)
  const parts = libraryCacheParts(username, query)
  const remote = useRemote(parts, () => api.users.library(username, query), username.length > 0)
  const viewerId = remote.session?.user.id ?? null
  const libraryKey = [...parts, viewerId] as const

  async function commit(
    run: () => Promise<unknown>,
    optimistic: (page: LibraryPageData) => LibraryPageData,
  ): Promise<string | null> {
    await queryClient.cancelQueries({ queryKey: libraryKey, exact: true })
    const previous = queryClient.getQueryData<LibraryPageData>(libraryKey)
    const next = previous ? optimistic(previous) : undefined
    const owned = next ? queryClient.setQueryData(libraryKey, next) : previous
    try {
      await run()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['library'] }),
        queryClient.invalidateQueries({ queryKey: ['game'] }),
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
      ])
      return null
    } catch (error) {
      const current = queryClient.getQueryData(libraryKey)
      if (previous && current === owned) queryClient.setQueryData(libraryKey, previous)
      return actionFailure(error)
    }
  }

  async function refresh() {
    setRefreshing(true)
    try {
      await remote.query.refetch()
    } finally {
      setRefreshing(false)
    }
  }

  if (remote.query.isError) {
    const failure = libraryFailure(remote.query.error)
    return (
      <LibraryNotice
        title={failure.title}
        body={failure.body}
        onBack={onBack}
        onRetry={() => { void remote.query.refetch() }}
      />
    )
  }
  if (!remote.query.data) return <LibrarySkeleton />

  return (
    <LibraryScreen
      games={remote.query.data.games}
      facets={remote.query.data.facets}
      query={query}
      canEdit={canEdit}
      title={title}
      refreshing={refreshing}
      onRefresh={() => { void refresh() }}
      onOpen={go}
      onBack={onBack}
      onQuery={setQuery}
      onSave={(gameId, write: LibraryWrite) => commit(
        () => api.me.library.put(gameId, write),
        page => applyLibraryWrite(page, gameId, write, query),
      )}
      onRemove={(gameId) => commit(
        () => api.me.library.delete(gameId),
        page => withoutLibraryGame(page, gameId),
      )}
    />
  )
}

export function OwnLibrary() {
  const { ready, session } = useAuth()
  const configured = apiConfigured()
  const me = useRemote(['me'], () => api.me.get(), session != null)
  if (!ready) return <LibrarySkeleton />
  if (!configured) {
    return <LibraryNotice title="API URL missing" body="Set EXPO_PUBLIC_API_URL to the ScreenPeak server." />
  }
  if (!session) return <LibraryScreen locked games={[]} onOpen={go} />
  if (me.query.isError) {
    const failure = libraryFailure(me.query.error)
    return (
      <LibraryNotice
        title={failure.title}
        body={failure.body}
        onRetry={() => { void me.query.refetch() }}
      />
    )
  }
  const username = me.query.data?.user?.username ?? ''
  if (!username) {
    if (!me.query.data) return <LibrarySkeleton />
    return <LibraryNotice title="Couldn't load this screen" body="Not found." />
  }
  return <LibraryBrowser username={username} canEdit title="Library" />
}

export function UserLibrary({ username }: { username: string }) {
  // Shares the profile hub cache. That entry is a hub model, not the raw page.
  const remote = useRemote(['profile', username], () => loadProfileHub(api, username), username.length > 0)
  if (remote.query.isError) {
    const failure = libraryFailure(remote.query.error)
    return (
      <LibraryNotice
        title={failure.title}
        body={failure.body}
        onBack={back}
        onRetry={() => { void remote.query.refetch() }}
      />
    )
  }
  if (!remote.query.data) return <LibrarySkeleton />
  if (remote.query.data.library == null) {
    return (
      <LibraryScreen
        access="private"
        title={`${username}'s Library`}
        onOpen={go}
        onBack={back}
      />
    )
  }
  const name = remote.query.data.username || username
  return (
    <LibraryBrowser
      username={name}
      canEdit={remote.query.data.isOwner}
      title={`${name}'s Library`}
      onBack={back}
    />
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  notice: { flex: 1 },
})
