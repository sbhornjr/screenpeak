import type { GamePageData } from '@screenpeak/shared/api/games'
import type { ListPageData, ListsPageData, ListsTab } from '@screenpeak/shared/api/lists'
import type { ListGameSync } from '@screenpeak/shared/api/writes'
import { ApiClientError } from '@screenpeak/shared/api/client'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { api, apiConfigured } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { actionFailure, withListMembership } from '@/lib/game-page'
import { back, go } from '@/lib/go'
import {
  listDetailQueryKey,
  listShowChoices,
  listsHeading,
  listsQueryKey,
  membershipPatch,
  patchViewerGames,
  sameViewerPlaceholder,
  withDetailEdits,
  withDetailLike,
  withListEdits,
  withListLike,
  withListPin,
  withNewList,
  withSyncedGames,
  withViewerListOption,
  withoutList,
  withoutListGame,
  withoutViewerList,
} from '@/lib/lists-page'
import { colors } from '@/theme'

import { AppHeader } from './app-header'
import { ListDetailScreen, ListDetailSkeleton } from './list-detail-screen'
import { ListsScreen, ListsSkeleton } from './lists-screen'
import { ScreenMessage } from './screen-state'

function loadFailure(error: unknown): { title: string, body: string } {
  if (error instanceof ApiClientError && error.status === 429) {
    return { title: 'Too many requests', body: actionFailure(error) }
  }
  return { title: "Couldn't load this screen", body: actionFailure(error) }
}

function Notice({ title, body, onRetry, onBack }: { title: string, body: string, onRetry?: () => void, onBack?: () => void }) {
  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader onBack={onBack} />
      <View style={styles.notice}>
        <ScreenMessage title={title} body={body} onRetry={onRetry} />
      </View>
    </SafeAreaView>
  )
}

type WriteGate<T> = { count: number, server: T | undefined, ok: boolean }

/**
 * Optimistic writes on one cache key. The server snapshot is taken synchronously
 * before the first await, and a failure puts that snapshot back even when a
 * second write has already replaced the optimistic object.
 */
function useCachedWrite<T>(key: readonly unknown[], viewerId: string | null) {
  const queryClient = useQueryClient()
  const writes = useRef(new Map<string, WriteGate<T>>())

  return async function commit(
    request: () => Promise<unknown>,
    optimistic?: (page: T) => T,
    touchGames?: (data: GamePageData) => GamePageData,
  ): Promise<string | null> {
    const id = JSON.stringify(key)
    let gate = writes.current.get(id)
    if (!gate) {
      gate = { count: 0, server: undefined, ok: false }
      writes.current.set(id, gate)
    }
    if (gate.count === 0) {
      gate.server = queryClient.getQueryData<T>(key)
      gate.ok = false
    }
    gate.count += 1
    const server = gate.server
    let restoreGames: (() => void) | null = null
    let failure: string | null = null
    try {
      await queryClient.cancelQueries({ queryKey: key, exact: true })
      const current = queryClient.getQueryData<T>(key) ?? server
      if (current && optimistic) queryClient.setQueryData(key, optimistic(current))
      if (touchGames) restoreGames = await patchViewerGames(queryClient, viewerId, touchGames)
      await request()
      gate.ok = true
    } catch (error) {
      if (server !== undefined) queryClient.setQueryData(key, server)
      restoreGames?.()
      failure = actionFailure(error)
    } finally {
      gate.count -= 1
      if (gate.count === 0) {
        const refresh = gate.ok
        writes.current.delete(id)
        if (refresh) {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['lists'] }),
            queryClient.invalidateQueries({ queryKey: ['game'] }),
          ])
        }
      }
    }
    return failure
  }
}

function latestListsPage(client: QueryClient, username: string, viewerId: string | null): ListsPageData | undefined {
  let latest: ListsPageData | undefined
  let updatedAt = -1
  for (const cached of client.getQueryCache().findAll({ queryKey: ['lists', username] })) {
    if (cached.queryKey[2] === 'detail' || cached.queryKey.at(-1) !== viewerId) continue
    if (cached.state.status !== 'success') continue
    const data = cached.state.data as ListsPageData | undefined
    if (!data || cached.state.dataUpdatedAt < updatedAt) continue
    updatedAt = cached.state.dataUpdatedAt
    latest = data
  }
  return latest
}

export function UserLists({ username }: { username: string }) {
  const queryClient = useQueryClient()
  const { ready, session } = useAuth()
  const configured = apiConfigured()
  const viewerId = session?.user.id ?? null
  const [tab, setTab] = useState<ListsTab>('user')
  const [refreshing, setRefreshing] = useState(false)
  const key = listsQueryKey(username, tab, viewerId)
  const listsQuery = useQuery({
    queryKey: key,
    queryFn: () => api.users.lists(username, tab),
    enabled: username.length > 0 && ready && configured,
    placeholderData: (previous, previousQuery) => sameViewerPlaceholder(previous, previousQuery, viewerId, username),
  })
  const commit = useCachedWrite<ListsPageData>(key, viewerId)

  async function refresh() {
    setRefreshing(true)
    try {
      await listsQuery.refetch()
    } finally {
      setRefreshing(false)
    }
  }

  if (!ready || !configured) {
    if (!configured) return <Notice title="API URL missing" body="Set EXPO_PUBLIC_API_URL to the ScreenPeak server." onBack={back} />
    return <ListsSkeleton onBack={back} />
  }

  const failure = listsQuery.isError ? loadFailure(listsQuery.error) : null
  const page = listsQuery.data ?? (failure ? latestListsPage(queryClient, username, viewerId) : undefined)
  if (!page) {
    if (failure) {
      return (
        <Notice
          title={failure.title}
          body={failure.body}
          onBack={back}
          onRetry={() => { void listsQuery.refetch() }}
        />
      )
    }
    return <ListsSkeleton onBack={back} />
  }

  const owner = viewerId != null && viewerId === page.profile.id
  const shows = listShowChoices(owner, page.profile.username)
  const show = shows.find(choice => choice.tab === tab) ?? shows[0]

  return (
    <ListsScreen
      title={listsHeading(owner, page.profile.username)}
      username={page.profile.username}
      show={show}
      shows={shows}
      lists={page.lists}
      viewerId={viewerId}
      canCreate={owner}
      defaultPublic={page.default_list_public ?? true}
      signedIn={viewerId != null}
      refreshing={refreshing || listsQuery.isFetching}
      loadError={failure?.body ?? null}
      onOpen={go}
      onBack={back}
      onShow={setTab}
      onRefresh={() => { void refresh() }}
      onRetry={failure ? () => { void listsQuery.refetch() } : undefined}
      onCreate={owner ? async (input) => {
        const error = await commit(async () => {
          const created = await api.lists.create(input)
          const userKey = listsQueryKey(username, 'user', viewerId)
          await queryClient.cancelQueries({ queryKey: userKey, exact: true })
          queryClient.setQueryData<ListsPageData>(userKey, current => current ? withNewList(current, created.id, input) : current)
          await patchViewerGames(queryClient, viewerId, data => withViewerListOption(data, {
            id: created.id,
            name: input.name.trim(),
            game_count: 0,
          }))
        })
        if (!error) setTab('user')
        return error
      } : undefined}
      onLike={(listId, liked) => commit(
        () => liked ? api.lists.like(listId) : api.lists.unlike(listId),
        current => withListLike(current, listId, liked),
      )}
      onPin={(listId, pinned) => commit(
        () => api.lists.update(listId, { isPinned: pinned }),
        current => withListPin(current, listId, pinned),
      )}
    />
  )
}

export function ListDetail({ username, listId }: { username: string, listId: string }) {
  const queryClient = useQueryClient()
  const { ready, session } = useAuth()
  const configured = apiConfigured()
  const viewerId = session?.user.id ?? null
  const [refreshing, setRefreshing] = useState(false)
  const key = listDetailQueryKey(username, listId, viewerId)
  const detailQuery = useQuery({
    queryKey: key,
    queryFn: () => api.users.list(username, listId),
    enabled: username.length > 0 && listId.length > 0 && ready && configured,
    placeholderData: (previous, previousQuery) => sameViewerPlaceholder(previous, previousQuery, viewerId, username, listId),
  })
  const commit = useCachedWrite<ListPageData>(key, viewerId)

  function patchIndex(update: (page: ListsPageData) => ListsPageData) {
    for (const tab of ['user', 'liked'] as const) {
      const indexKey = listsQueryKey(username, tab, viewerId)
      queryClient.setQueryData<ListsPageData>(indexKey, current => current ? update(current) : current)
    }
  }

  async function refresh() {
    setRefreshing(true)
    try {
      await detailQuery.refetch()
    } finally {
      setRefreshing(false)
    }
  }

  if (!ready || !configured) {
    if (!configured) return <Notice title="API URL missing" body="Set EXPO_PUBLIC_API_URL to the ScreenPeak server." onBack={back} />
    return <ListDetailSkeleton onBack={back} />
  }

  const failure = detailQuery.isError ? loadFailure(detailQuery.error) : null
  const page = detailQuery.data
  if (!page) {
    if (failure) {
      return (
        <Notice
          title={failure.title}
          body={failure.body}
          onBack={back}
          onRetry={() => { void detailQuery.refetch() }}
        />
      )
    }
    return <ListDetailSkeleton onBack={back} />
  }

  const owner = page.viewer?.is_owner ?? false

  return (
    <ListDetailScreen
      name={page.list.name}
      description={page.list.description}
      username={page.profile.username}
      avatarUrl={page.profile.avatar_url}
      gameCount={page.list.game_count}
      updatedAt={page.list.updated_at}
      likeCount={page.like_count}
      liked={page.viewer?.has_liked ?? false}
      canEdit={owner}
      canDelete={owner && !page.list.is_default}
      isPublic={page.list.is_public}
      isPinned={page.list.is_pinned}
      signedIn={viewerId != null}
      games={page.games}
      refreshing={refreshing || detailQuery.isFetching}
      loadError={failure?.body ?? null}
      onOpen={go}
      onBack={back}
      onRefresh={() => { void refresh() }}
      onRetry={failure ? () => { void detailQuery.refetch() } : undefined}
      onLike={(liked) => commit(
        () => liked ? api.lists.like(listId) : api.lists.unlike(listId),
        current => withDetailLike(current, liked),
      )}
      onEdit={(input) => commit(
        async () => {
          await api.lists.update(listId, input)
          patchIndex(index => withListEdits(index, listId, input))
        },
        current => withDetailEdits(current, input),
      )}
      onDelete={async () => {
        const error = await commit(
          async () => {
            await api.lists.delete(listId)
            patchIndex(index => withoutList(index, listId))
          },
          undefined,
          data => withoutViewerList(data, listId),
        )
        if (!error) back()
        return error
      }}
      onSearch={async (query) => {
        const result = await api.games.search(query)
        return result.games
      }}
      onSaveGames={(sync, added) => commit(
        () => api.lists.syncGames(listId, sync),
        current => withSyncedGames(current, sync, added),
        data => applySyncToGame(data, listId, sync),
      )}
      onRemoveGame={(gameId) => commit(
        () => api.lists.removeGame(listId, gameId),
        current => withoutListGame(current, gameId),
        membershipPatch(listId, gameId, false),
      )}
    />
  )
}

function applySyncToGame(data: GamePageData, listId: string, sync: ListGameSync): GamePageData {
  const removed = sync.toRemove.some(game => game.id === data.game.id)
  const added = sync.toAdd.some(game => game.id === data.game.id)
  if (removed) return withListMembership(data, listId, false)
  if (added) return withListMembership(data, listId, true)
  return data
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  notice: { flex: 1 },
})
