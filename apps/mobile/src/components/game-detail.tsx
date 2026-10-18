import type { GamePageData, GameReviewsPage } from '@screenpeak/shared/api/games'
import type { GameRatingsStats } from '@screenpeak/shared/types'
import { Image } from 'expo-image'
import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

import { igdbImageUri } from '@/lib/catalog-image'
import { colors, face, radius, space, tierColor, tracking, trackingPx, typeScale } from '@/theme'

import { Avatar } from './avatar'
import { Button } from './button'
import { DataAttribution } from './data-attribution'
import { EmptyState } from './empty-state'
import { GameCard } from './game-card'
import { Panel } from './panel'
import { RatingBadge } from './rating-badge'
import { SectionHead } from './section-head'
import { Sheet } from './sheet'
import { TextField } from './text-field'
import { Wordmark } from './wordmark'

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
      <Wordmark />
      <Button label="Back" variant="ghost" onPress={onBack} />
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

      <SectionHead>The Scoreboard</SectionHead>
      <Panel style={styles.scorePanel}>
        <View style={styles.scores}>
          <View style={styles.scoreBlock}>
            <Text style={styles.scoreLabel}>You</Text>
            {yours == null ? <Text style={styles.scoreEmpty}>—</Text> : <RatingBadge score={yours} />}
            <Text style={styles.scoreScale}> / 10</Text>
          </View>
          <View style={styles.scoreBlock}>
            <Text style={styles.scoreLabel}>Community</Text>
            {community == null ? <Text style={styles.scoreEmpty}>—</Text> : (
              <Text style={[styles.communityScore, { color: colors.community }]}>{community}</Text>
            )}
            <Text style={styles.scoreScale}> / 10</Text>
            <Text style={styles.scoreMeta}>
              {stats.total_ratings} {stats.total_ratings === 1 ? 'score' : 'scores'}
            </Text>
          </View>
        </View>
      </Panel>

      <Text style={styles.scoreLabel}>Your turn</Text>
      <View style={styles.actions}>
        <Button
          label={yours == null ? 'Rate' : `Rated ${yours}`}
          accessibilityLabel="Rate"
          variant="secondary"
          onPress={() => accountAction('rate')}
        />
        <Button
          label={viewer?.libraryEntry ? statusLabel(viewer.libraryEntry.status) : 'Save game'}
          accessibilityLabel="Save game"
          variant="secondary"
          onPress={() => accountAction('save')}
        />
        <Button label="Add to list" variant="secondary" onPress={() => accountAction('list')} />
      </View>
      {actionError ? <Text style={styles.body}>{actionError}</Text> : null}

      <Sheet visible={panel === 'rate'} title="Rate" onClose={() => setPanel(null)}>
        <View style={styles.actions}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(score => (
            <Button
              key={score}
              label={String(score)}
              accessibilityLabel={`Score ${score}`}
              variant="secondary"
              onPress={() => { if (onRate) void run(() => onRate(score, note)) }}
            />
          ))}
        </View>
        <TextField label="Review note" value={note} onChangeText={setNote} />
      </Sheet>
      <Sheet visible={panel === 'save'} title="Save game" onClose={() => setPanel(null)}>
        <View style={styles.actions}>
          {LIBRARY_STATUS.map(status => (
            <Button
              key={status}
              label={statusLabel(status)}
              accessibilityLabel={`Log as ${status}`}
              variant="secondary"
              onPress={() => { if (onSave) void run(() => onSave(status)) }}
            />
          ))}
        </View>
      </Sheet>
      <Sheet visible={panel === 'list'} title="Add to list" onClose={() => setPanel(null)}>
        {(viewer?.lists ?? []).map(list => {
          const listed = viewer?.listIdsGameIsIn.includes(list.id) ?? false
          return (
            <Button
              key={list.id}
              label={list.name}
              accessibilityLabel={listed ? `Remove from ${list.name}` : `Add to ${list.name}`}
              variant="secondary"
              onPress={() => {
                if (listed && onRemoveFromList) void run(() => onRemoveFromList(list.id), true)
                if (!listed && onAddToList) void run(() => onAddToList(list.id), true)
              }}
            />
          )
        })}
        <TextField label="New list name" value={listName} onChangeText={setListName} />
        <Button
          label="Create list"
          variant="secondary"
          onPress={() => { if (onCreateList && listName.trim()) void run(() => onCreateList(listName.trim()), true) }}
        />
      </Sheet>
      <Sheet visible={prompt} title="Sign up" onClose={() => setPrompt(false)}>
        <Text style={styles.body}>Sign up to rate, log, or list this game.</Text>
        <Button label="Sign up" onPress={onSignUp} />
        <Button label="Log in" variant="secondary" onPress={onSignIn} />
      </Sheet>

      <SectionHead>Credits</SectionHead>
      <Text style={styles.metaLabel}>Platforms</Text>
      <Text style={styles.body}>{taxonomy.platforms.map(row => row.name).join(', ') || '—'}</Text>
      <Text style={styles.metaLabel}>Developed by</Text>
      <Text style={styles.body}>{taxonomy.developers.map(row => row.name).join(', ') || '—'}</Text>
      <Text style={styles.metaLabel}>Published by</Text>
      <Text style={styles.body}>{taxonomy.publishers.map(row => row.name).join(', ') || '—'}</Text>

      {game.description ? (
        <>
          <SectionHead>About</SectionHead>
          <Text style={styles.body}>{game.description}</Text>
        </>
      ) : null}

      {shots.length > 0 ? (
        <>
          <SectionHead>Gallery</SectionHead>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>
            {shots.map(uri => (
              <Image key={uri} source={uri} style={styles.shot} contentFit="cover" accessibilityLabel={`${game.name} screenshot`} />
            ))}
          </ScrollView>
        </>
      ) : null}

      <SectionHead count={stats.total_ratings > 0 ? `${stats.total_ratings} ${stats.total_ratings === 1 ? 'score' : 'scores'}` : 'no scores yet'}>
        The Community
      </SectionHead>
      {stats.total_ratings > 0 ? (
        distribution.map(row => (
          <View key={row.name} style={styles.barRow}>
            <Text style={styles.barLabel}>{row.name}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${(row.count / maxCount) * 100}%`, backgroundColor: tierColor(row.name) }]} />
            </View>
            <Text style={styles.barCount}>{row.count}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.body}>No one on ScreenPeak has scored {game.name} yet.</Text>
      )}

      <SectionHead count={stats.total_reviews}>Reviews</SectionHead>
      {reviewsNote ? (
        <View>
          <Text style={styles.body}>{reviewsNote}</Text>
          <Button label="Retry reviews" variant="ghost" onPress={onRetryReviews} />
        </View>
      ) : null}
      {viewer?.review?.review ? (
        <Panel style={styles.review}>
          <Text style={[styles.reviewUser, { color: tierColor(viewer.review.rating) }]}>
            You · {viewer.review.rating} / 10
          </Text>
          <Text style={styles.body}>{`“${viewer.review.review}”`}</Text>
        </Panel>
      ) : null}
      {reviews?.reviews.map(review => (
        <Panel key={review.user_id} style={styles.review}>
          <View style={styles.reviewHead}>
            <Avatar alt={review.users.username} src={review.users.avatar_url || null} size="sm" />
            <Text style={[styles.reviewUser, { color: tierColor(review.rating) }]}>
              {review.users.username} · {review.rating} / 10
            </Text>
          </View>
          <Text style={styles.body}>{review.review ? `“${review.review}”` : 'Scored it, no note.'}</Text>
        </Panel>
      ))}
      {stats.total_reviews === 0 ? <EmptyState dense title="No written reviews yet." /> : null}

      <DataAttribution />
    </ScrollView>
  )
}

const TITLE = typeScale['4xl'].size

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[6], paddingTop: space[6], paddingBottom: space[12], gap: space[3] },
  titleRow: { flexDirection: 'row', alignItems: 'stretch', gap: space[3] },
  titleSeam: { width: 3, backgroundColor: colors.accent },
  title: {
    flex: 1,
    fontFamily: face.display[600],
    fontSize: TITLE,
    lineHeight: TITLE,
    letterSpacing: trackingPx(tracking.display, TITLE),
    color: colors.text,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], alignItems: 'center' },
  tag: {
    fontFamily: face.mono[400],
    fontSize: typeScale.eyebrow.size,
    color: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    paddingHorizontal: space[2],
    paddingVertical: space[0.5],
  },
  year: { fontFamily: face.mono[400], fontSize: typeScale.xs.size, color: colors.muted },
  cardWrap: { width: 180 },
  scorePanel: { padding: space[4] },
  scores: { flexDirection: 'row', gap: space[6] },
  scoreBlock: { gap: space[1] },
  scoreLabel: {
    fontFamily: face.mono[400],
    fontSize: typeScale.eyebrow.size,
    letterSpacing: trackingPx(tracking.label, typeScale.eyebrow.size),
    textTransform: 'uppercase',
    color: colors.muted,
  },
  scoreEmpty: { fontFamily: face.display[600], fontSize: typeScale['2xl'].size, color: colors.muted },
  communityScore: { fontFamily: face.display[600], fontSize: typeScale['2xl'].size },
  scoreScale: { fontFamily: face.mono[400], fontSize: typeScale.xs.size, color: colors.muted },
  scoreMeta: { fontFamily: face.mono[400], fontSize: typeScale.xs.size, color: colors.muted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  metaLabel: {
    fontFamily: face.mono[400],
    fontSize: typeScale.eyebrow.size,
    letterSpacing: trackingPx(tracking.wide, typeScale.eyebrow.size),
    textTransform: 'uppercase',
    color: colors.muted,
  },
  body: { fontFamily: face.body[400], fontSize: typeScale.base.size, lineHeight: typeScale.base.line, color: colors.text },
  gallery: { gap: space[2] },
  shot: { width: 240, height: 135, borderRadius: radius.base, backgroundColor: colors.surfaceLight },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  barLabel: { width: 20, fontFamily: face.mono[400], fontSize: typeScale.xs.size, color: colors.text, textAlign: 'right' },
  barTrack: { flex: 1, height: 8, backgroundColor: colors.surfaceLight, borderRadius: radius.bar, overflow: 'hidden' },
  barFill: { height: '100%' },
  barCount: { width: 24, fontFamily: face.mono[400], fontSize: typeScale.xs.size, color: colors.muted },
  review: { padding: space[3], gap: space[2] },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  reviewUser: { fontFamily: face.mono[600], fontSize: typeScale.sm.size, lineHeight: typeScale.sm.line },
})
