import type { GamePageData, GameReviewsPage } from '@screenpeak/shared/api/games'
import type { GameRatingsStats } from '@screenpeak/shared/types'
import { Image } from 'expo-image'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'

import { igdbImageUri } from '@/lib/catalog-image'
import { colors, face, radius, space, tierColor, tracking, trackingPx } from '@/theme'

import { DataAttribution } from './data-attribution'
import { Eyebrow } from './eyebrow'
import { GameCard } from './game-card'

const LIBRARY_STATUS = ['playing', 'completed', 'backlog', 'abandoned'] as const

type LibraryStatus = (typeof LIBRARY_STATUS)[number]

export type GameDetailProps = {
  data: GamePageData
  reviews: GameReviewsPage | null
  reviewsNote: string | null
  signedIn: boolean
  onBack: () => void
  onSignIn: () => void
  onSignUp: () => void
  onRetryReviews: () => void
  onRate?: (rating: number, review: string) => Promise<string | null>
  onSave?: (status: LibraryStatus) => Promise<string | null>
  onAddToList?: (listId: string) => Promise<string | null>
  onRemoveFromList?: (listId: string) => Promise<string | null>
  onCreateList?: (name: string) => Promise<string | null>
}

function communityScore(stats: GameRatingsStats): number | null {
  if (stats.total_ratings <= 0 || stats.avg_rating == null || stats.avg_rating <= 0) return null
  return stats.avg_rating
}

function yearOf(released: string | null): number | null {
  if (!released) return null
  const year = Number(released.slice(0, 4))
  return Number.isInteger(year) ? year : null
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function asStatus(value: string | undefined): LibraryStatus | null {
  return LIBRARY_STATUS.find(status => status === value) ?? null
}

/** The native game page. Signed out, viewer is null and account actions ask you to sign up. */
export function GameDetail({
  data,
  reviews,
  reviewsNote,
  signedIn,
  onBack,
  onSignIn,
  onSignUp,
  onRetryReviews,
  onRate,
  onSave,
  onAddToList,
  onRemoveFromList,
  onCreateList,
}: GameDetailProps) {
  const { game, taxonomy, stats } = data
  const viewer = signedIn ? data.viewer : null
  const community = communityScore(stats)
  const yours = viewer?.review?.rating ?? null
  const year = yearOf(game.released)
  const shots = game.screenshots.flatMap(url => {
    const uri = igdbImageUri(url)
    return uri ? [uri] : []
  })
  const [prompt, setPrompt] = useState(false)
  const [panel, setPanel] = useState<'rate' | 'save' | 'list' | null>(null)
  const [note, setNote] = useState(viewer?.review?.review ?? '')
  const [listName, setListName] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  function accountAction(next: 'rate' | 'save' | 'list') {
    if (!signedIn) {
      setPrompt(true)
      return
    }
    setActionError(null)
    setPanel(panel === next ? null : next)
  }

  async function run(action: () => Promise<string | null>, keepOpen = false) {
    const error = await action()
    setActionError(error)
    if (!error && !keepOpen) setPanel(null)
  }

  const distribution = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(name => ({
    name,
    count: Number(stats[`rating_${name}` as keyof GameRatingsStats] ?? 0),
  }))
  const maxCount = Math.max(...distribution.map(row => row.count), 1)

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" accessibilityLabel="Games" onPress={onBack} style={styles.back}>
        <Text style={styles.backText}>Games</Text>
      </Pressable>
      <Eyebrow>ScreenPeak</Eyebrow>
      <View style={styles.titleRow}>
        <View style={styles.titleSeam} />
        <Text style={styles.title}>{game.name}</Text>
      </View>
      <View style={styles.tags}>
        {taxonomy.genres.map(genre => (
          <Text key={genre.id} style={styles.tag}>{genre.name}</Text>
        ))}
        {game.esrb_rating ? <Text style={styles.tag}>{game.esrb_rating}</Text> : null}
        {year ? <Text style={styles.year}>{year}</Text> : null}
      </View>

      <View style={styles.cardWrap}>
        <GameCard
          game={{
            id: game.id,
            name: game.name,
            slug: game.slug,
            cover_image_url: game.cover_image_url,
            released: game.released,
          }}
          developer={taxonomy.developers[0]?.name ?? null}
          spRating={community}
          userRating={yours}
          libraryStatus={asStatus(viewer?.libraryEntry?.status)}
        />
      </View>

      <Text style={styles.section}>The Scoreboard</Text>
      <View style={styles.scores}>
        <View style={styles.scoreBlock}>
          <Text style={styles.scoreLabel}>You</Text>
          <Text style={[styles.scoreValue, { color: yours == null ? colors.muted : tierColor(yours) }]}>
            {yours ?? '—'}
            <Text style={styles.scoreScale}> / 10</Text>
          </Text>
        </View>
        <View style={styles.scoreBlock}>
          <Text style={styles.scoreLabel}>Community</Text>
          <Text style={[styles.scoreValue, { color: colors.community }]}>
            {community ?? '—'}
            <Text style={styles.scoreScale}> / 10</Text>
          </Text>
          <Text style={styles.scoreMeta}>
            {stats.total_ratings} {stats.total_ratings === 1 ? 'score' : 'scores'}
          </Text>
        </View>
      </View>

      <Text style={styles.scoreLabel}>Your turn</Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Rate" onPress={() => accountAction('rate')} style={styles.action}>
          <Text style={styles.actionText}>{yours == null ? 'Rate' : `Rated ${yours}`}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Save game" onPress={() => accountAction('save')} style={styles.action}>
          <Text style={styles.actionText}>{viewer?.libraryEntry ? statusLabel(viewer.libraryEntry.status) : 'Save game'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Add to list" onPress={() => accountAction('list')} style={styles.action}>
          <Text style={styles.actionText}>Add to list</Text>
        </Pressable>
      </View>
      {actionError ? <Text style={styles.body}>{actionError}</Text> : null}
      {panel === 'rate' ? (
        <View style={styles.prompt}>
          <View style={styles.actions}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(score => (
              <Pressable
                key={score}
                accessibilityRole="button"
                accessibilityLabel={`Score ${score}`}
                onPress={() => { if (onRate) void run(() => onRate(score, note)) }}
                style={styles.action}
              >
                <Text style={styles.actionText}>{score}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            accessibilityLabel="Review note"
            value={note}
            onChangeText={setNote}
            style={styles.note}
          />
        </View>
      ) : null}
      {panel === 'save' ? (
        <View style={styles.actions}>
          {LIBRARY_STATUS.map(status => (
            <Pressable
              key={status}
              accessibilityRole="button"
              accessibilityLabel={`Log as ${status}`}
              onPress={() => { if (onSave) void run(() => onSave(status)) }}
              style={styles.action}
            >
              <Text style={styles.actionText}>{statusLabel(status)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {panel === 'list' ? (
        <View style={styles.prompt}>
          {(viewer?.lists ?? []).map(list => {
            const listed = viewer?.listIdsGameIsIn.includes(list.id) ?? false
            return (
              <Pressable
                key={list.id}
                accessibilityRole="button"
                accessibilityLabel={listed ? `Remove from ${list.name}` : `Add to ${list.name}`}
                onPress={() => {
                  if (listed && onRemoveFromList) void run(() => onRemoveFromList(list.id), true)
                  if (!listed && onAddToList) void run(() => onAddToList(list.id), true)
                }}
                style={styles.action}
              >
                <Text style={styles.actionText}>{list.name}</Text>
              </Pressable>
            )
          })}
          <TextInput
            accessibilityLabel="New list name"
            value={listName}
            onChangeText={setListName}
            style={styles.note}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create list"
            onPress={() => { if (onCreateList && listName.trim()) void run(() => onCreateList(listName.trim()), true) }}
            style={styles.action}
          >
            <Text style={styles.actionText}>Create list</Text>
          </Pressable>
        </View>
      ) : null}

      {prompt ? (
        <View style={styles.prompt}>
          <Text style={styles.promptTitle}>Sign up to rate, log, or list this game.</Text>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Sign up" onPress={onSignUp} style={styles.actionPrimary}>
              <Text style={styles.actionPrimaryText}>Sign up</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Log in" onPress={onSignIn} style={styles.action}>
              <Text style={styles.actionText}>Log in</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Text style={styles.section}>Credits</Text>
      <Text style={styles.metaLabel}>Platforms</Text>
      <Text style={styles.body}>{taxonomy.platforms.map(row => row.name).join(', ') || '—'}</Text>
      <Text style={styles.metaLabel}>Developed by</Text>
      <Text style={styles.body}>{taxonomy.developers.map(row => row.name).join(', ') || '—'}</Text>
      <Text style={styles.metaLabel}>Published by</Text>
      <Text style={styles.body}>{taxonomy.publishers.map(row => row.name).join(', ') || '—'}</Text>

      {game.description ? (
        <>
          <Text style={styles.section}>About</Text>
          <Text style={styles.body}>{game.description}</Text>
        </>
      ) : null}

      {shots.length > 0 ? (
        <>
          <Text style={styles.section}>Gallery</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>
            {shots.map(uri => (
              <Image key={uri} source={uri} style={styles.shot} contentFit="cover" accessibilityLabel={`${game.name} screenshot`} />
            ))}
          </ScrollView>
        </>
      ) : null}

      <Text style={styles.section}>The Community</Text>
      {stats.total_ratings > 0 ? (
        distribution.map(row => (
          <View key={row.name} style={styles.barRow}>
            <Text style={styles.barLabel}>{row.name}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${(row.count / maxCount) * 100}%` }]} />
            </View>
            <Text style={styles.barCount}>{row.count}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.body}>No one on ScreenPeak has scored {game.name} yet.</Text>
      )}

      <Text style={styles.section}>Reviews</Text>
      {reviewsNote ? (
        <View>
          <Text style={styles.body}>{reviewsNote}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry reviews" onPress={onRetryReviews}>
            <Text style={styles.actionText}>Retry reviews</Text>
          </Pressable>
        </View>
      ) : null}
      {viewer?.review?.review ? (
        <View style={styles.review}>
          <Text style={styles.reviewUser}>You · {viewer.review.rating} / 10</Text>
          <Text style={styles.body}>&ldquo;{viewer.review.review}&rdquo;</Text>
        </View>
      ) : null}
      {reviews?.reviews.map(review => (
        <View key={review.user_id} style={styles.review}>
          <Text style={styles.reviewUser}>{review.users.username} · {review.rating} / 10</Text>
          <Text style={styles.body}>{review.review ? `“${review.review}”` : 'Scored it, no note.'}</Text>
        </View>
      ))}
      {stats.total_reviews === 0 ? <Text style={styles.muted}>No written reviews yet.</Text> : null}

      <DataAttribution />
    </ScrollView>
  )
}

const TITLE = 32

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[6], paddingTop: space[6], paddingBottom: space[12], gap: space[3] },
  back: { alignSelf: 'flex-start' },
  backText: {
    fontFamily: face.mono[400],
    fontSize: 11,
    letterSpacing: trackingPx(tracking.label, 11),
    textTransform: 'uppercase',
    color: colors.muted,
  },
  titleRow: { flexDirection: 'row', alignItems: 'stretch', gap: space[3] },
  titleSeam: { width: 3, backgroundColor: colors.accent },
  title: {
    flex: 1,
    fontFamily: face.display[600],
    fontSize: TITLE,
    lineHeight: 34,
    letterSpacing: trackingPx(tracking.display, TITLE),
    color: colors.text,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], alignItems: 'center' },
  tag: {
    fontFamily: face.mono[400],
    fontSize: 11,
    color: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    paddingHorizontal: space[2],
    paddingVertical: space[0.5],
  },
  year: { fontFamily: face.mono[400], fontSize: 12, color: colors.muted },
  cardWrap: { width: 180 },
  section: {
    marginTop: space[4],
    fontFamily: face.mono[400],
    fontSize: 11,
    letterSpacing: trackingPx(tracking.wide, 11),
    textTransform: 'uppercase',
    color: colors.muted,
  },
  scores: { flexDirection: 'row', gap: space[6] },
  scoreBlock: { gap: space[1] },
  scoreLabel: {
    fontFamily: face.mono[400],
    fontSize: 11,
    letterSpacing: trackingPx(tracking.label, 11),
    textTransform: 'uppercase',
    color: colors.muted,
  },
  scoreValue: { fontFamily: face.display[600], fontSize: 28, color: colors.text },
  scoreScale: { fontFamily: face.mono[400], fontSize: 12, color: colors.muted },
  scoreMeta: { fontFamily: face.mono[400], fontSize: 12, color: colors.muted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  action: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  actionText: { fontFamily: face.body[500], fontSize: 14, color: colors.text },
  note: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    fontFamily: face.body[400],
    fontSize: 16,
    color: colors.text,
  },
  actionPrimary: {
    backgroundColor: colors.accent,
    borderRadius: radius.base,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  actionPrimaryText: { fontFamily: face.body[600], fontSize: 14, color: colors.bg },
  prompt: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.base,
    padding: space[4],
    gap: space[3],
  },
  promptTitle: { fontFamily: face.body[500], fontSize: 16, lineHeight: 22, color: colors.text },
  metaLabel: {
    fontFamily: face.mono[400],
    fontSize: 11,
    letterSpacing: trackingPx(tracking.wide, 11),
    textTransform: 'uppercase',
    color: colors.muted,
  },
  body: { fontFamily: face.body[400], fontSize: 16, lineHeight: 24, color: colors.text },
  muted: { fontFamily: face.body[400], fontSize: 14, color: colors.muted },
  gallery: { gap: space[2] },
  shot: { width: 240, height: 135, borderRadius: radius.base, backgroundColor: colors.surfaceLight },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  barLabel: { width: 20, fontFamily: face.mono[400], fontSize: 12, color: colors.text, textAlign: 'right' },
  barTrack: { flex: 1, height: 8, backgroundColor: colors.surfaceLight, borderRadius: radius.bar, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.community },
  barCount: { width: 24, fontFamily: face.mono[400], fontSize: 12, color: colors.muted },
  review: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.base,
    padding: space[3],
    gap: space[2],
  },
  reviewUser: { fontFamily: face.body[600], fontSize: 14, color: colors.text },
})
