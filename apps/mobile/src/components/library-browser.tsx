import type { LibraryPageData, LibraryQuery } from '@screenpeak/shared/api/library'
import type { LibraryWrite } from '@screenpeak/shared/api/writes'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { api, apiConfigured } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useCachedWrite } from '@/lib/cached-write'
import { loadFailure } from '@/lib/failure'
import { back, go } from '@/lib/go'
import { applyLibraryWrite, LIBRARY_QUERY, withoutLibraryGame } from '@/lib/library-page'
import { loadProfileHub } from '@/lib/profile-hub'
import { keepSameScope, latestCached, playerScope, queryKeys, scopes } from '@/lib/query-keys'
import { useRefresh } from '@/lib/use-refresh'
import { useRemote } from '@/lib/use-remote'

import { LibraryScreen, LibrarySkeleton } from './library-screen'
import { API_MISSING, ScreenNotice } from './screen-state'

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
  const { ready, session } = useAuth()
  const configured = apiConfigured()
  const viewerId = session?.user.id ?? null
  const libraryKey = queryKeys.library(username, query, viewerId)
  const libraryQuery = useQuery({
    queryKey: libraryKey,
    queryFn: () => api.users.library(username, query),
    enabled: username.length > 0 && ready && configured,
    placeholderData: keepSameScope(playerScope('library', username), viewerId),
  })
  const commit = useCachedWrite<LibraryPageData>(libraryKey, {
    viewerId,
    invalidate: [scopes.library, scopes.game, scopes.profile],
  })
  const { refreshing, refresh } = useRefresh(libraryQuery.refetch)
  const failure = libraryQuery.isError ? loadFailure(libraryQuery.error) : null
  const page = libraryQuery.data
    ?? (failure ? latestCached<LibraryPageData>(queryClient, playerScope('library', username), viewerId) : undefined)

  if (!page) {
    if (failure) {
      return (
        <ScreenNotice
          title={failure.title}
          body={failure.body}
          onBack={onBack}
          onRetry={() => { void libraryQuery.refetch() }}
        />
      )
    }
    return <LibrarySkeleton />
  }

  return (
    <LibraryScreen
      games={page.games}
      facets={page.facets}
      query={query}
      canEdit={canEdit}
      title={title}
      refreshing={refreshing || libraryQuery.isFetching}
      loadError={failure?.body ?? null}
      onRetry={failure ? () => { void libraryQuery.refetch() } : undefined}
      onRefresh={refresh}
      onOpen={go}
      onBack={onBack}
      onQuery={setQuery}
      onSave={(gameId, write: LibraryWrite) => commit(
        () => api.me.library.put(gameId, write),
        current => applyLibraryWrite(current, gameId, write, query),
      )}
      onRemove={(gameId) => commit(
        () => api.me.library.delete(gameId),
        current => withoutLibraryGame(current, gameId),
      )}
    />
  )
}

export function OwnLibrary() {
  const { ready, session } = useAuth()
  const configured = apiConfigured()
  const me = useRemote(queryKeys.me, () => api.me.get(), session != null)
  if (!ready) return <LibrarySkeleton />
  if (!configured) return <ScreenNotice {...API_MISSING} />
  if (!session) return <LibraryScreen locked games={[]} onOpen={go} />
  if (me.query.isError) {
    const failure = loadFailure(me.query.error)
    return (
      <ScreenNotice
        title={failure.title}
        body={failure.body}
        onRetry={() => { void me.query.refetch() }}
      />
    )
  }
  const username = me.query.data?.user?.username ?? ''
  if (!username) {
    if (!me.query.data) return <LibrarySkeleton />
    return <ScreenNotice title="Couldn't load this screen" body="Not found." />
  }
  return <LibraryBrowser username={username} canEdit title="Library" />
}

export function UserLibrary({ username }: { username: string }) {
  // Shares the profile hub cache. That entry is a hub model, not the raw page.
  const remote = useRemote(viewer => queryKeys.profile(username, viewer), () => loadProfileHub(api, username), username.length > 0)
  if (remote.query.isError) {
    const failure = loadFailure(remote.query.error)
    return (
      <ScreenNotice
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
