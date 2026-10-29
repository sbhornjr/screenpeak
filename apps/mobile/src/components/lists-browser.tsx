import type { GamePageData } from '@screenpeak/shared/api/games'
import type { ListPageData, ListsPageData, ListsTab } from '@screenpeak/shared/api/lists'
import type { ListGameSync } from '@screenpeak/shared/api/writes'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { api, apiConfigured } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { patchViewerGames, useCachedWrite } from '@/lib/cached-write'
import { loadFailure } from '@/lib/failure'
import { withListMembership } from '@/lib/game-page'
import { back, go } from '@/lib/go'
import {
  listShowChoices,
  listsHeading,
  membershipPatch,
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
import {
  isListDetailKey,
  keepSameScope,
  latestCached,
  listDetailScope,
  playerScope,
  queryKeys,
  scopes,
} from '@/lib/query-keys'
import { useRefresh } from '@/lib/use-refresh'

import { ListDetailScreen, ListDetailSkeleton } from './list-detail-screen'
import { ListsScreen, ListsSkeleton } from './lists-screen'
import { API_MISSING, ScreenNotice } from './screen-state'

const LIST_WRITE_SCOPES = [scopes.lists, scopes.game]

export function UserLists({ username }: { username: string }) {
  const queryClient = useQueryClient()
  const { ready, session } = useAuth()
  const configured = apiConfigured()
  const viewerId = session?.user.id ?? null
  const [tab, setTab] = useState<ListsTab>('user')
  const key = queryKeys.lists(username, tab, viewerId)
  const listsQuery = useQuery({
    queryKey: key,
    queryFn: () => api.users.lists(username, tab),
    enabled: username.length > 0 && ready && configured,
    placeholderData: keepSameScope(playerScope('lists', username), viewerId),
  })
  const commit = useCachedWrite<ListsPageData>(key, { viewerId, invalidate: LIST_WRITE_SCOPES })
  const { refreshing, refresh } = useRefresh(listsQuery.refetch)

  if (!ready || !configured) {
    if (!configured) return <ScreenNotice {...API_MISSING} onBack={back} />
    return <ListsSkeleton onBack={back} />
  }

  const failure = listsQuery.isError ? loadFailure(listsQuery.error) : null
  const page = listsQuery.data
    ?? (failure ? latestCached<ListsPageData>(queryClient, playerScope('lists', username), viewerId, isListDetailKey) : undefined)
  if (!page) {
    if (failure) {
      return (
        <ScreenNotice
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
      onRefresh={refresh}
      onRetry={failure ? () => { void listsQuery.refetch() } : undefined}
      onCreate={owner ? async (input) => {
        const error = await commit(async () => {
          const created = await api.lists.create(input)
          const userKey = queryKeys.lists(username, 'user', viewerId)
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
  const key = queryKeys.listDetail(username, listId, viewerId)
  const detailQuery = useQuery({
    queryKey: key,
    queryFn: () => api.users.list(username, listId),
    enabled: username.length > 0 && listId.length > 0 && ready && configured,
    placeholderData: keepSameScope(listDetailScope(username, listId), viewerId),
  })
  const commit = useCachedWrite<ListPageData>(key, { viewerId, invalidate: LIST_WRITE_SCOPES })
  const { refreshing, refresh } = useRefresh(detailQuery.refetch)

  function patchIndex(update: (page: ListsPageData) => ListsPageData) {
    for (const tab of ['user', 'liked'] as const) {
      const indexKey = queryKeys.lists(username, tab, viewerId)
      queryClient.setQueryData<ListsPageData>(indexKey, current => current ? update(current) : current)
    }
  }

  if (!ready || !configured) {
    if (!configured) return <ScreenNotice {...API_MISSING} onBack={back} />
    return <ListDetailSkeleton onBack={back} />
  }

  const failure = detailQuery.isError ? loadFailure(detailQuery.error) : null
  const page = detailQuery.data
  if (!page) {
    if (failure) {
      return (
        <ScreenNotice
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
      onRefresh={refresh}
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
