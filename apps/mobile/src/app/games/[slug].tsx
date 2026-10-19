import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { GameDetail } from '@/components/game-detail'
import { ScreenMessage } from '@/components/screen-state'
import { api, apiConfigured } from '@/lib/api'
import { ApiClientError } from '@/lib/api/client'
import { useAuth } from '@/lib/auth'
import { back } from '@/lib/go'
import { colors } from '@/theme'

function messageOf(error: unknown): string {
  if (error instanceof ApiClientError) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong.'
}

export default function GameScreen() {
  const params = useLocalSearchParams<{ slug: string }>()
  const slug = typeof params.slug === 'string' ? params.slug : ''
  const router = useRouter()
  const queryClient = useQueryClient()
  const { session, ready } = useAuth()
  const viewerId = session?.user.id ?? null
  const configured = apiConfigured()

  const game = useQuery({
    queryKey: ['game', slug, viewerId],
    queryFn: () => api.games.get(slug),
    enabled: ready && configured && slug.length > 0,
  })
  const reviews = useQuery({
    queryKey: ['game', slug, 'reviews', viewerId],
    queryFn: () => api.games.reviews(slug),
    enabled: ready && configured && slug.length > 0 && game.isSuccess,
  })

  async function afterWrite(run: () => Promise<unknown>): Promise<string | null> {
    try {
      await run()
      await queryClient.invalidateQueries({ queryKey: ['game', slug] })
      return null
    } catch (error) {
      return messageOf(error)
    }
  }

  const signedIn = session != null
  const gameId = game.data?.game.id

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      {!configured ? (
        <ScreenMessage title="API URL missing" body="Set EXPO_PUBLIC_API_URL to the ScreenPeak server." />
      ) : slug.length === 0 ? (
        <ScreenMessage title="Missing game" body="This link does not include a game." />
      ) : !ready || game.isLoading ? (
        <ScreenMessage title="Loading" body={slug} />
      ) : game.isError ? (
        <ScreenMessage title="Couldn't load this game" body={messageOf(game.error)} onRetry={() => { void game.refetch() }} />
      ) : game.data ? (
        <GameDetail
          data={game.data}
          reviews={reviews.data ?? null}
          reviewsNote={reviews.isError ? messageOf(reviews.error) : null}
          signedIn={signedIn}
          onBack={back}
          onSignIn={() => router.push('/sign-in')}
          onSignUp={() => router.push('/sign-up')}
          onRetryReviews={() => { void reviews.refetch() }}
          onRate={signedIn && gameId ? (rating, review) => afterWrite(() => api.games.putReview(gameId, { rating, review })) : undefined}
          onSave={signedIn && gameId ? (status) => afterWrite(() => api.me.library.put(gameId, { status })) : undefined}
          onAddToList={signedIn && gameId ? (listId) => afterWrite(() => api.lists.addGame(listId, gameId)) : undefined}
          onRemoveFromList={signedIn && gameId ? (listId) => afterWrite(() => api.lists.removeGame(listId, gameId)) : undefined}
          onCreateList={signedIn && gameId ? (name) => afterWrite(() => api.lists.create({
            name,
            description: '',
            isPublic: game.data?.viewer?.defaultListPrivacy ?? true,
            isPinned: false,
            gameId,
          })) : undefined}
        />
      ) : null}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
})
