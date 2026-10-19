import type { GamePageData } from '@screenpeak/shared/api/games'
import type { LibraryWrite } from '@screenpeak/shared/api/writes'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { GameDetail, GameDetailSkeleton } from '@/components/game-detail'
import { ScreenMessage } from '@/components/screen-state'
import { api, apiConfigured } from '@/lib/api'
import { actionFailure, withLibraryWrite, withListMembership, withViewerReview, withoutLibraryEntry, type ReviewListQuery } from '@/lib/game-page'
import { useAuth } from '@/lib/auth'
import { back, go } from '@/lib/go'
import { catalogueHref, profileHref } from '@/lib/routes'
import { colors } from '@/theme'

const FIRST_PAGE: ReviewListQuery = { page: 1, sort: 'date', order: 'desc' }

export default function GameScreen() {
  const params = useLocalSearchParams<{ slug: string }>()
  const slug = typeof params.slug === 'string' ? params.slug : ''
  const router = useRouter()
  const queryClient = useQueryClient()
  const { session, ready } = useAuth()
  const viewerId = session?.user.id ?? null
  const configured = apiConfigured()
  const [reviewState, setReviewState] = useState({ slug, query: FIRST_PAGE })
  const reviewsQuery = reviewState.slug === slug ? reviewState.query : FIRST_PAGE
  const [refreshing, setRefreshing] = useState(false)

  const game = useQuery({
    queryKey: ['game', slug, viewerId],
    queryFn: () => api.games.get(slug),
    enabled: ready && configured && slug.length > 0,
  })
  const reviews = useQuery({
    queryKey: ['game', slug, 'reviews', viewerId, reviewsQuery.page, reviewsQuery.sort, reviewsQuery.order],
    queryFn: () => api.games.reviews(slug, reviewsQuery),
    enabled: ready && configured && slug.length > 0 && game.isSuccess,
  })

  const gameKey = ['game', slug, viewerId] as const

  async function commit(
    run: () => Promise<unknown>,
    optimistic?: (data: GamePageData) => GamePageData,
  ): Promise<string | null> {
    await queryClient.cancelQueries({ queryKey: gameKey })
    const previous = queryClient.getQueryData<GamePageData>(gameKey)
    if (optimistic && previous) queryClient.setQueryData(gameKey, optimistic(previous))
    try {
      await run()
      await queryClient.invalidateQueries({ queryKey: ['game', slug] })
      return null
    } catch (error) {
      if (previous) queryClient.setQueryData(gameKey, previous)
      return actionFailure(error)
    }
  }

  async function refresh() {
    setRefreshing(true)
    try {
      await Promise.all([game.refetch(), reviews.refetch()])
    } finally {
      setRefreshing(false)
    }
  }

  const signedIn = session != null
  const gameId = game.data?.game.id
  const userId = viewerId ?? ''

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      {!configured ? (
        <ScreenMessage title="API URL missing" body="Set EXPO_PUBLIC_API_URL to the ScreenPeak server." />
      ) : slug.length === 0 ? (
        <ScreenMessage title="Missing game" body="This link does not include a game." />
      ) : !ready || game.isLoading ? (
        <GameDetailSkeleton />
      ) : game.isError ? (
        <ScreenMessage title="Couldn't load this game" body={actionFailure(game.error)} onRetry={() => { void game.refetch() }} />
      ) : game.data && gameId ? (
        <GameDetail
          data={game.data}
          reviews={reviews.data ?? null}
          reviewsNote={reviews.isError ? actionFailure(reviews.error) : null}
          reviewsQuery={reviewsQuery}
          signedIn={signedIn}
          refreshing={refreshing}
          onRefresh={() => { void refresh() }}
          onBack={back}
          onSignIn={() => router.push('/sign-in')}
          onSignUp={() => router.push('/sign-up')}
          onRetryReviews={() => { void reviews.refetch() }}
          onReviewsQuery={query => setReviewState({ slug, query })}
          onOpenProfile={username => go(profileHref(username))}
          onOpenCatalogue={filter => go(catalogueHref(filter))}
          onRate={signedIn ? (rating, review) => commit(
            () => api.games.putReview(gameId, { rating, review }),
            data => withViewerReview(data, rating, review, userId),
          ) : undefined}
          onSave={signedIn ? (write: LibraryWrite) => commit(
            () => api.me.library.put(gameId, write),
            data => withLibraryWrite(data, write),
          ) : undefined}
          onRemoveLibrary={signedIn ? () => commit(
            () => api.me.library.delete(gameId),
            withoutLibraryEntry,
          ) : undefined}
          onAddToList={signedIn ? (listId) => commit(
            () => api.lists.addGame(listId, gameId),
            data => withListMembership(data, listId, true),
          ) : undefined}
          onRemoveFromList={signedIn ? (listId) => commit(
            () => api.lists.removeGame(listId, gameId),
            data => withListMembership(data, listId, false),
          ) : undefined}
          onCreateList={signedIn ? (input) => commit(() => api.lists.create({ ...input, gameId })) : undefined}
        />
      ) : null}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
})
