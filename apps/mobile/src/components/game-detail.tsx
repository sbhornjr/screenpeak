import type { GamePageData, GameReviewsPage } from '@screenpeak/shared/api/games'
import type { LibraryWrite, ListWrite } from '@screenpeak/shared/api/writes'
import type { GameRatingsStats } from '@screenpeak/shared/types'
import { createListSchema, ratingReviewSchema } from '@screenpeak/shared/schemas'
import { Image } from 'expo-image'
import { useRef, useState } from 'react'
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'

import { igdbImageUri } from '@/lib/catalog-image'
import {
  communityScore,
  libraryForm,
  libraryWrite,
  LIBRARY_CHOICES,
  ratingLabel,
  relTime,
  scoreGap,
  statusLabel,
  yearOf,
  type LibraryForm,
  type ReviewListQuery,
} from '@/lib/game-page'
import { colors, face, radius, space, tierColor, tracking, trackingPx, typeScale } from '@/theme'

import { Avatar } from './avatar'
import { Button } from './button'
import { DataAttribution } from './data-attribution'
import { EmptyState } from './empty-state'
import { Panel } from './panel'
import { SectionHead } from './section-head'
import { Sheet } from './sheet'
import { TextField } from './text-field'
import { Wordmark } from './wordmark'

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const DEFAULT_QUERY: ReviewListQuery = { page: 1, sort: 'date', order: 'desc' }

export type GameDetailProps = {
  data: GamePageData
  reviews: GameReviewsPage | null
  reviewsNote: string | null
  reviewsLoading?: boolean
  reviewsQuery?: ReviewListQuery
  signedIn: boolean
  refreshing?: boolean
  onRefresh?: () => void
  onBack: () => void
  onSignIn: () => void
  onSignUp: () => void
  onRetryReviews: () => void
  onReviewsQuery?: (query: ReviewListQuery) => void
  onOpenProfile?: (username: string) => void
  onOpenCatalogue?: (filter: { genre?: string, platform?: string, developer?: string, publisher?: string, esrb?: string }) => void
  onRate?: (rating: number, review: string) => Promise<string | null>
  onSave?: (write: LibraryWrite) => Promise<string | null>
  onRemoveLibrary?: () => Promise<string | null>
  onAddToList?: (listId: string) => Promise<string | null>
  onRemoveFromList?: (listId: string) => Promise<string | null>
  onCreateList?: (input: Pick<ListWrite, 'name' | 'description' | 'isPublic' | 'isPinned'>) => Promise<string | null>
}

function redditName(url: string): string {
  const name = url.replace(/https?:\/\/(www\.)?reddit\.com\/r\//i, '').replace(/\/$/, '')
  return name ? `r/${name}` : 'Reddit'
}

function Elsewhere({ url }: { url: string }) {
  const name = redditName(url)
  return (
    <>
      <SectionHead>Elsewhere</SectionHead>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Open ${name}`}
        onPress={() => { void Linking.openURL(url).catch(() => undefined) }}
      >
        <Text style={styles.link}>{name}</Text>
      </Pressable>
    </>
  )
}

function distributionOf(stats: GameRatingsStats) {
  return [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(name => ({
    name,
    count: Number(stats[`rating_${name}` as keyof GameRatingsStats] ?? 0),
  }))
}

/** The native game page. Signed out, viewer is null and account actions ask you to sign up. */
export function GameDetail({
  data,
  reviews,
  reviewsNote,
  reviewsLoading = false,
  reviewsQuery = DEFAULT_QUERY,
  signedIn,
  refreshing = false,
  onRefresh,
  onBack,
  onSignIn,
  onSignUp,
  onRetryReviews,
  onReviewsQuery,
  onOpenProfile,
  onOpenCatalogue,
  onRate,
  onSave,
  onRemoveLibrary,
  onAddToList,
  onRemoveFromList,
  onCreateList,
}: GameDetailProps) {
  const { game, taxonomy, stats } = data
  const viewer = signedIn ? data.viewer : null
  const community = communityScore(stats)
  const yours = viewer?.review?.rating ?? null
  const year = yearOf(game.released)
  const cover = igdbImageUri(game.cover_image_url)
  const shots = game.screenshots.flatMap(url => {
    const uri = igdbImageUri(url)
    return uri ? [uri] : []
  })
  const { width } = useWindowDimensions()
  const compact = width <= 375
  const [prompt, setPrompt] = useState(false)
  const [panel, setPanel] = useState<'rate' | 'save' | 'list' | null>(null)
  const [score, setScore] = useState<number | null>(yours)
  const [note, setNote] = useState(viewer?.review?.review ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [form, setForm] = useState<LibraryForm>(() => libraryForm(viewer?.libraryEntry ?? null))
  const [details, setDetails] = useState(false)
  const [listName, setListName] = useState('')
  const [listDescription, setListDescription] = useState('')
  const [listPublic, setListPublic] = useState(viewer?.defaultListPrivacy ?? true)
  const [listPinned, setListPinned] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [canRetry, setCanRetry] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lastAction, setLastAction] = useState<(() => Promise<string | null>) | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [aboutFullHeight, setAboutFullHeight] = useState(0)
  const [aboutLimitHeight, setAboutLimitHeight] = useState(0)
  const [shotIndex, setShotIndex] = useState(0)
  const pending = useRef(false)

  function fail(message: string) {
    setCanRetry(false)
    setActionError(message)
  }

  function openAccount(next: 'rate' | 'save' | 'list') {
    if (!signedIn) {
      setPrompt(true)
      return
    }
    setActionError(null)
    setCanRetry(false)
    if (panel === next) {
      setPanel(null)
      return
    }
    if (next === 'rate') {
      setScore(viewer?.review?.rating ?? null)
      setNote(viewer?.review?.review ?? '')
      setConfirmDelete(false)
    }
    if (next === 'save') {
      setForm(libraryForm(viewer?.libraryEntry ?? null))
      setDetails(false)
    }
    if (next === 'list') {
      setListName('')
      setListDescription('')
      setListPublic(viewer?.defaultListPrivacy ?? true)
      setListPinned(false)
    }
    setPanel(next)
  }

  async function run(action: () => Promise<string | null>, keepOpen = false) {
    if (pending.current) return
    pending.current = true
    setLastAction(() => action)
    setCanRetry(false)
    setActionError(null)
    setBusy(true)
    try {
      const error = await action()
      setActionError(error)
      setCanRetry(error != null)
      if (!error && !keepOpen) setPanel(null)
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  function retry() {
    if (lastAction) void run(lastAction, panel === 'list')
  }

  async function submitRating() {
    if (score == null) {
      fail('Pick a score.')
      return
    }
    const parsed = ratingReviewSchema.safeParse({ rating: score, review: note })
    if (!parsed.success) {
      fail(parsed.error.issues[0]?.message ?? 'Check the rating.')
      return
    }
    if (!onRate) return
    const rating = parsed.data.rating
    const review = parsed.data.review
    await run(() => onRate(rating, review))
  }

  async function deleteReview() {
    const rating = viewer?.review?.rating
    if (rating == null || !onRate) return
    await run(() => onRate(rating, ''))
  }

  async function submitLibrary() {
    const result = libraryWrite(viewer?.libraryEntry ?? null, form)
    if (!result.ok) {
      fail(result.message)
      return
    }
    if (!result.write) {
      fail('Nothing to update.')
      return
    }
    if (!onSave) return
    const write = result.write
    await run(() => onSave(write))
  }

  async function submitList() {
    const parsed = createListSchema.safeParse({
      name: listName,
      description: listDescription,
      isPublic: listPublic,
      isPinned: listPinned,
    })
    if (!parsed.success) {
      fail(parsed.error.issues[0]?.message ?? 'Give the list a name')
      return
    }
    if (!onCreateList) return
    const input = {
      name: parsed.data.name,
      description: parsed.data.description,
      isPublic: parsed.data.isPublic,
      isPinned: parsed.data.isPinned,
    }
    await run(async () => {
      const error = await onCreateList(input)
      if (!error) {
        setListName('')
        setListDescription('')
      }
      return error
    }, true)
  }

  const rows = distributionOf(stats)
  const maxCount = Math.max(...rows.map(row => row.count), 1)
  const gap = scoreGap({
    you: yours,
    community,
    communityCount: stats.total_ratings,
    signedIn,
  })
  const inFile = !!(viewer?.review || viewer?.libraryEntry)
  const aboutOverflows = aboutFullHeight > aboutLimitHeight + 1 && aboutLimitHeight > 0
  const titleSize = compact ? typeScale['3xl'].size : typeScale['4xl'].size
  const frame = shots.length === 0 ? null : shots[Math.min(shotIndex, shots.length - 1)]

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, compact && styles.contentCompact]}
      refreshControl={onRefresh
        ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        : undefined}
    >
      <Wordmark />
      <Button label="Back" variant="ghost" onPress={onBack} />
      <View style={styles.titleRow}>
        <View style={styles.titleSeam} />
        <Text
          accessibilityRole="header"
          accessibilityLevel={1}
          style={[styles.title, {
            fontSize: titleSize,
            lineHeight: Math.round(titleSize * 0.97),
            letterSpacing: trackingPx(tracking.display, titleSize),
          }]}
        >
          {game.name}
        </Text>
      </View>
      <View style={styles.tags}>
        {taxonomy.genres.map(genre => (
          <Button
            key={genre.id}
            label={genre.name}
            accessibilityLabel={`Browse ${genre.name}`}
            variant="secondary"
            onPress={() => onOpenCatalogue?.({ genre: genre.slug })}
          />
        ))}
        {game.esrb_rating ? (
          <Button
            label={game.esrb_rating}
            accessibilityLabel={`Browse games rated ${game.esrb_rating}`}
            variant="secondary"
            onPress={() => onOpenCatalogue?.({ esrb: game.esrb_rating ?? undefined })}
          />
        ) : null}
        {year ? <Text style={styles.year}>{year}</Text> : null}
      </View>

      <View style={styles.cover}>
        {cover ? (
          <Image source={cover} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={`${game.name} cover`} />
        ) : (
          <Text style={styles.noCover}>No Cover</Text>
        )}
      </View>

      <Panel style={styles.savePanel}>
        <Text style={styles.metaLabel}>Your save</Text>
        {inFile ? (
          <View style={styles.stack}>
            {viewer?.libraryEntry ? <Text style={styles.body}>Status {statusLabel(viewer.libraryEntry.status)}</Text> : null}
            {yours != null ? <Text style={styles.body}>Your score {yours} / 10</Text> : null}
            {viewer?.review?.updated_at ? <Text style={styles.meta}>Scored {relTime(viewer.review.updated_at)}</Text> : null}
            {!viewer?.libraryEntry && yours == null ? <Text style={styles.body}>Saved, not scored yet</Text> : null}
          </View>
        ) : (
          <Text style={styles.body}>Not in your save yet. Save the game to add it.</Text>
        )}
      </Panel>

      <SectionHead>The Scoreboard</SectionHead>
      <Panel style={styles.scorePanel}>
        <View style={styles.scores}>
          <View style={styles.scoreBlock}>
            <Text style={styles.scoreLabel}>You</Text>
            {yours == null ? <Text style={styles.scoreEmpty}>—</Text> : (
              <Text accessibilityLabel={`Your score ${yours} out of 10`} style={[styles.communityScore, { color: colors.you }]}>
                {yours}
              </Text>
            )}
            <Text style={styles.scoreScale}>{yours == null ? (signedIn ? 'not scored' : 'sign in to rate') : '/ 10'}</Text>
          </View>
          <View style={styles.scoreBlock}>
            <Text style={styles.scoreLabel}>Community</Text>
            {community == null ? <Text style={styles.scoreEmpty}>—</Text> : (
              <Text
                accessibilityLabel={`Community score ${community} out of 10`}
                style={[styles.communityScore, { color: colors.community }]}
              >
                {community}
              </Text>
            )}
            <Text style={styles.scoreScale}>
              {community == null ? 'No ratings yet' : `/ 10 · ${stats.total_ratings}`}
            </Text>
          </View>
        </View>
        {gap ? <Text style={styles.gap}>{gap}</Text> : null}
      </Panel>

      <Text style={styles.scoreLabel}>Your turn</Text>
      <View style={styles.actions}>
        <Button
          label={yours == null ? 'Rate' : 'Amend'}
          accessibilityLabel="Rate"
          variant="secondary"
          onPress={() => openAccount('rate')}
        />
        <Button
          label={viewer?.libraryEntry ? statusLabel(viewer.libraryEntry.status) : 'Save game'}
          accessibilityLabel="Save game"
          variant="secondary"
          onPress={() => openAccount('save')}
        />
        <Button label="Add to list" variant="secondary" onPress={() => openAccount('list')} />
      </View>

      <Sheet visible={panel === 'rate'} title={yours == null ? 'Rate and review' : 'Update rating and review'} onClose={() => setPanel(null)}>
        <View style={styles.actions}>
          {SCORES.map(value => {
            const selected = score === value
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityLabel={`Score ${value}`}
                accessibilityState={{ selected }}
                onPress={() => setScore(value)}
                style={[styles.scoreKey, { borderColor: tierColor(value) }, selected && { backgroundColor: tierColor(value) }]}
              >
                <Text style={[styles.scoreKeyText, { color: selected ? colors.bg : tierColor(value) }]}>{value}</Text>
              </Pressable>
            )
          })}
        </View>
        <Text style={styles.body}>{score == null ? 'Pick a score.' : ratingLabel(score)}</Text>
        <TextField label="Review note" value={note} onChangeText={setNote} multiline />
        {actionError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{actionError}</Text> : null}
        {canRetry ? <Button label="Retry" variant="secondary" onPress={retry} /> : null}
        <Button label={busy ? 'Saving…' : 'Submit rating'} disabled={busy} onPress={() => { void submitRating() }} />
        {viewer?.review?.review ? (
          confirmDelete ? (
            <View style={styles.stack}>
              <Text style={styles.body}>Delete this review? Your score stays.</Text>
              <Button label="Delete the written review" variant="secondary" disabled={busy} onPress={() => { void deleteReview() }} />
              <Button label="Keep review" variant="ghost" onPress={() => setConfirmDelete(false)} />
            </View>
          ) : (
            <Button label="Delete review" variant="ghost" onPress={() => setConfirmDelete(true)} />
          )
        ) : null}
      </Sheet>

      <Sheet visible={panel === 'save'} title={viewer?.libraryEntry ? 'Manage game' : 'Add to library'} onClose={() => setPanel(null)}>
        {LIBRARY_CHOICES.map(choice => {
          const selected = form.status === choice.status
          return (
            <Pressable
              key={choice.status}
              accessibilityRole="button"
              accessibilityLabel={`Log as ${choice.status}`}
              accessibilityState={{ selected }}
              onPress={() => setForm(current => ({ ...current, status: choice.status }))}
              style={[styles.statusRow, selected && styles.statusSelected]}
            >
              <Text style={styles.statusTitle}>{choice.label}</Text>
              <Text style={styles.meta}>{choice.description}</Text>
            </Pressable>
          )
        })}
        <Button
          label={details ? 'Hide library details' : 'Show library details'}
          variant="ghost"
          onPress={() => setDetails(open => !open)}
        />
        {details ? (
          <View style={styles.stack}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="100% achievements completed"
              accessibilityState={{ checked: form.completed }}
              onPress={() => setForm(current => ({ ...current, completed: !current.completed }))}
              style={[styles.statusRow, form.completed && styles.statusSelected]}
            >
              <Text style={styles.body}>100% achievements completed</Text>
              <Text style={styles.meta}>{form.completed ? 'On' : 'Off'}</Text>
            </Pressable>
            <TextField
              label="Hours played"
              value={form.hours}
              onChangeText={value => setForm(current => ({ ...current, hours: value }))}
              keyboardType="decimal-pad"
            />
            <Text style={styles.metaLabel}>Times played</Text>
            <View style={styles.actions}>
              <Button
                label="−"
                accessibilityLabel="Fewer times played"
                variant="secondary"
                onPress={() => setForm(current => ({ ...current, playCount: Math.max(1, current.playCount - 1) }))}
              />
              <Text style={styles.playCount}>{form.playCount}</Text>
              <Button
                label="+"
                accessibilityLabel="More times played"
                variant="secondary"
                onPress={() => setForm(current => ({ ...current, playCount: Math.min(32767, current.playCount + 1) }))}
              />
            </View>
          </View>
        ) : null}
        {actionError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{actionError}</Text> : null}
        {canRetry ? <Button label="Retry" variant="secondary" onPress={retry} /> : null}
        <Button
          label={busy ? 'Saving…' : (viewer?.libraryEntry ? 'Update library entry' : 'Save game')}
          disabled={busy}
          onPress={() => { void submitLibrary() }}
        />
        {viewer?.libraryEntry && onRemoveLibrary ? (
          <Button label="Remove from library" variant="secondary" disabled={busy} onPress={() => { void run(() => onRemoveLibrary()) }} />
        ) : null}
      </Sheet>

      <Sheet visible={panel === 'list'} title="Add to list" onClose={() => setPanel(null)}>
        {(viewer?.lists ?? []).length === 0 ? <Text style={styles.body}>{"You don't have a list yet."}</Text> : null}
        {(viewer?.lists ?? []).map(list => {
          const listed = viewer?.listIdsGameIsIn.includes(list.id) ?? false
          return (
            <Button
              key={list.id}
              label={listed ? `${list.name} · On this list` : list.name}
              accessibilityLabel={listed ? `Remove from ${list.name}` : `Add to ${list.name}`}
              selected={listed}
              variant="secondary"
              disabled={busy}
              onPress={() => {
                if (listed && onRemoveFromList) void run(() => onRemoveFromList(list.id), true)
                if (!listed && onAddToList) void run(() => onAddToList(list.id), true)
              }}
            />
          )
        })}
        <TextField label="New list name" value={listName} onChangeText={setListName} />
        <TextField label="List description" value={listDescription} onChangeText={setListDescription} multiline />
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Public list"
          accessibilityState={{ checked: listPublic }}
          onPress={() => setListPublic(value => !value)}
          style={[styles.statusRow, listPublic && styles.statusSelected]}
        >
          <Text style={styles.body}>Public</Text>
          <Text style={styles.meta}>{listPublic ? 'On' : 'Off'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Pinned list"
          accessibilityState={{ checked: listPinned }}
          onPress={() => setListPinned(value => !value)}
          style={[styles.statusRow, listPinned && styles.statusSelected]}
        >
          <Text style={styles.body}>Pinned</Text>
          <Text style={styles.meta}>{listPinned ? 'On' : 'Off'}</Text>
        </Pressable>
        {actionError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{actionError}</Text> : null}
        {canRetry ? <Button label="Retry" variant="secondary" onPress={retry} /> : null}
        <Button label={busy ? 'Saving…' : 'Create list'} disabled={busy} onPress={() => { void submitList() }} />
      </Sheet>

      <Sheet visible={prompt} title="Sign up" onClose={() => setPrompt(false)}>
        <Text style={styles.body}>Sign up to rate, log, or list this game.</Text>
        <Button label="Sign up" onPress={onSignUp} />
        <Button label="Log in" variant="secondary" onPress={onSignIn} />
      </Sheet>

      <SectionHead>Credits</SectionHead>
      <Text style={styles.metaLabel}>Platforms</Text>
      <View style={styles.tags}>
        {taxonomy.platforms.length === 0 ? <Text style={styles.body}>—</Text> : taxonomy.platforms.map(row => (
          <Button
            key={row.id}
            label={row.name}
            accessibilityLabel={`Browse ${row.name}`}
            variant="ghost"
            onPress={() => onOpenCatalogue?.({ platform: row.slug })}
          />
        ))}
      </View>
      <Text style={styles.metaLabel}>Developed by</Text>
      <View style={styles.tags}>
        {taxonomy.developers.length === 0 ? <Text style={styles.body}>—</Text> : taxonomy.developers.map(row => (
          <Button
            key={row.id}
            label={row.name}
            accessibilityLabel={`Browse ${row.name}`}
            variant="ghost"
            onPress={() => onOpenCatalogue?.({ developer: row.slug })}
          />
        ))}
      </View>
      <Text style={styles.metaLabel}>Published by</Text>
      <View style={styles.tags}>
        {taxonomy.publishers.length === 0 ? <Text style={styles.body}>—</Text> : taxonomy.publishers.map(row => (
          <Button
            key={row.id}
            label={row.name}
            accessibilityLabel={`Browse ${row.name}`}
            variant="ghost"
            onPress={() => onOpenCatalogue?.({ publisher: row.slug })}
          />
        ))}
      </View>

      {game.description ? (
        <View style={styles.about}>
          <SectionHead>About</SectionHead>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.aboutMeasure}>
            <Text style={styles.body} onLayout={event => setAboutFullHeight(event.nativeEvent.layout.height)}>{game.description}</Text>
            <Text numberOfLines={6} style={styles.body} onLayout={event => setAboutLimitHeight(event.nativeEvent.layout.height)}>{game.description}</Text>
          </View>
          <Text numberOfLines={aboutOverflows && !aboutOpen ? 6 : undefined} style={styles.body}>{game.description}</Text>
          {aboutOverflows ? (
            <Button label={aboutOpen ? 'Show less' : 'Read more'} variant="ghost" onPress={() => setAboutOpen(open => !open)} />
          ) : null}
        </View>
      ) : null}

      {frame ? (
        <>
          <SectionHead>Gallery</SectionHead>
          <View style={styles.shotFrame}>
            <Image
              key={frame}
              source={frame}
              style={styles.shot}
              contentFit="cover"
              accessibilityLabel={`Screenshot ${Math.min(shotIndex, shots.length - 1) + 1} of ${shots.length}`}
            />
            {shots.length > 1 ? (
              <View style={styles.shotNav}>
                <Button
                  label="Previous"
                  accessibilityLabel="Previous screenshot"
                  variant="secondary"
                  onPress={() => setShotIndex(index => (index - 1 + shots.length) % shots.length)}
                />
                <Button
                  label="Next"
                  accessibilityLabel="Next screenshot"
                  variant="secondary"
                  onPress={() => setShotIndex(index => (index + 1) % shots.length)}
                />
              </View>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open screenshot full size"
            onPress={() => { void Linking.openURL(frame).catch(() => undefined) }}
          >
            <Text style={styles.link}>Open full size</Text>
          </Pressable>
        </>
      ) : null}

      <SectionHead count={stats.total_ratings > 0 ? `${stats.total_ratings} ${stats.total_ratings === 1 ? 'score' : 'scores'}` : 'no scores yet'}>
        The Community
      </SectionHead>
      {stats.total_ratings > 0 ? (
        <Panel style={styles.scorePanel}>
          {rows.map(row => (
            <View key={row.name} style={styles.barRow}>
              <Text style={styles.barLabel}>{row.name}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, {
                  width: row.count > 0 ? `${(row.count / maxCount) * 100}%` : 0,
                  minWidth: row.count > 0 ? 3 : 0,
                  backgroundColor: colors.community,
                }]} />
              </View>
              <Text style={styles.barCount}>
                {row.count > 0 ? `${row.count} · ${Math.round((row.count / stats.total_ratings) * 100)}%` : '—'}
              </Text>
            </View>
          ))}
        </Panel>
      ) : (
        <Text style={styles.body}>No one on ScreenPeak has scored {game.name} yet. Be the first to put it on the board.</Text>
      )}

      <SectionHead count={stats.total_reviews}>Reviews</SectionHead>
      {stats.total_reviews > 1 ? (
        <View style={styles.actions}>
          <Button
            label="Date"
            accessibilityLabel="Sort reviews by date"
            selected={reviewsQuery.sort === 'date'}
            variant="secondary"
            onPress={() => onReviewsQuery?.({ ...reviewsQuery, page: 1, sort: 'date' })}
          />
          <Button
            label="Rating"
            accessibilityLabel="Sort reviews by rating"
            selected={reviewsQuery.sort === 'rating'}
            variant="secondary"
            onPress={() => onReviewsQuery?.({ ...reviewsQuery, page: 1, sort: 'rating' })}
          />
          <Button
            label={reviewsQuery.order === 'desc' ? 'Sort descending' : 'Sort ascending'}
            variant="secondary"
            onPress={() => onReviewsQuery?.({
              ...reviewsQuery,
              page: 1,
              order: reviewsQuery.order === 'desc' ? 'asc' : 'desc',
            })}
          />
        </View>
      ) : null}
      {reviewsLoading ? <Text style={styles.meta}>Loading reviews</Text> : null}
      {reviewsNote ? (
        <View style={styles.stack}>
          <Text style={styles.body}>{reviewsNote}</Text>
          <Button label="Retry reviews" variant="ghost" onPress={onRetryReviews} />
        </View>
      ) : null}
      {viewer?.review?.review ? (
        <Panel style={styles.review}>
          <View style={styles.reviewHead}>
            <Avatar alt="You" src={viewer.review.users.avatar_url || null} size="sm" />
            <Text style={styles.reviewName}>You</Text>
            <Text style={styles.meta}>{relTime(viewer.review.created_at)}</Text>
            <Text style={[styles.reviewUser, { color: tierColor(viewer.review.rating) }]}>
              {viewer.review.rating} / 10
            </Text>
          </View>
          <Text style={styles.body}>{`“${viewer.review.review}”`}</Text>
        </Panel>
      ) : null}
      {reviews?.reviews.map(review => (
        <Panel key={review.user_id} style={styles.review}>
          <View style={styles.reviewHead}>
            <Avatar alt={review.users.username} src={review.users.avatar_url || null} size="sm" />
            <Pressable accessibilityRole="link" accessibilityLabel={review.users.username} onPress={() => onOpenProfile?.(review.users.username)}>
              <Text style={styles.reviewName}>{review.users.username}</Text>
            </Pressable>
            <Text style={styles.meta}>{relTime(review.created_at)}</Text>
            <Text style={[styles.reviewUser, { color: tierColor(review.rating) }]}>{review.rating} / 10</Text>
          </View>
          <Text style={styles.body}>{review.review ? `“${review.review}”` : 'Scored it, no note.'}</Text>
        </Panel>
      ))}
      {stats.total_reviews === 0 ? <EmptyState dense title="No written reviews yet." /> : null}
      {reviews && reviews.totalPages > 1 ? (
        <View style={styles.actions}>
          {reviewsQuery.page > 1 ? (
            <Button
              label="Previous page"
              variant="secondary"
              onPress={() => onReviewsQuery?.({ ...reviewsQuery, page: reviewsQuery.page - 1 })}
            />
          ) : null}
          <Text style={styles.meta}>Page {reviewsQuery.page} of {reviews.totalPages}</Text>
          {reviewsQuery.page < reviews.totalPages ? (
            <Button
              label="Next page"
              variant="secondary"
              onPress={() => onReviewsQuery?.({ ...reviewsQuery, page: reviewsQuery.page + 1 })}
            />
          ) : null}
        </View>
      ) : null}

      {game.reddit_url ? (
        <Elsewhere url={game.reddit_url} />
      ) : null}

      <DataAttribution />
    </ScrollView>
  )
}

export function GameDetailSkeleton() {
  return (
    <View accessibilityLabel="Loading game" style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.boneTitle} />
        <View style={styles.boneCover} />
        <View style={styles.boneScore} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[6], paddingTop: space[6], paddingBottom: space[12], gap: space[3] },
  contentCompact: { paddingHorizontal: space[4] },
  titleRow: { flexDirection: 'row', alignItems: 'stretch', gap: space[3] },
  titleSeam: { width: 3, backgroundColor: colors.accent },
  title: {
    flex: 1,
    fontFamily: face.display[600],
    color: colors.text,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], alignItems: 'center' },
  year: { fontFamily: face.mono[400], fontSize: typeScale.xs.size, color: colors.muted },
  cover: {
    width: 180,
    aspectRatio: 3 / 4,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceLight,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noCover: {
    fontFamily: face.mono[400],
    fontSize: typeScale.eyebrow.size,
    letterSpacing: trackingPx(tracking.wide, typeScale.eyebrow.size),
    textTransform: 'uppercase',
    color: colors.muted,
  },
  savePanel: { padding: space[4], gap: space[2] },
  stack: { gap: space[2] },
  scorePanel: { padding: space[4], gap: space[2] },
  scores: { flexDirection: 'row', gap: space[6] },
  scoreBlock: { flex: 1, gap: space[1] },
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
  gap: {
    fontFamily: face.mono[400],
    fontSize: typeScale.eyebrow.size,
    letterSpacing: trackingPx(tracking.wider, typeScale.eyebrow.size),
    textTransform: 'uppercase',
    color: colors.muted,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space[2],
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], alignItems: 'center' },
  scoreKey: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: space[2],
    borderWidth: 1,
    borderRadius: radius.base,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  scoreKeyText: { fontFamily: face.mono[600], fontSize: typeScale.base.size },
  statusRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    gap: space[1],
    backgroundColor: colors.surface,
  },
  statusSelected: { borderColor: colors.accent },
  statusTitle: { fontFamily: face.display[600], fontSize: typeScale.base.size, color: colors.text },
  playCount: {
    minWidth: 32,
    fontFamily: face.mono[600],
    fontSize: typeScale.lg.size,
    color: colors.text,
    textAlign: 'center',
  },
  metaLabel: {
    fontFamily: face.mono[400],
    fontSize: typeScale.eyebrow.size,
    letterSpacing: trackingPx(tracking.wide, typeScale.eyebrow.size),
    textTransform: 'uppercase',
    color: colors.muted,
  },
  meta: { fontFamily: face.mono[400], fontSize: typeScale.xs.size, color: colors.muted },
  body: { fontFamily: face.body[400], fontSize: typeScale.base.size, lineHeight: typeScale.base.line, color: colors.text },
  error: { fontFamily: face.body[400], fontSize: typeScale.sm.size, lineHeight: typeScale.sm.line, color: colors.bad },
  link: {
    fontFamily: face.mono[400],
    fontSize: typeScale.sm.size,
    color: colors.accent,
    textDecorationLine: 'underline',
  },
  about: { position: 'relative', gap: space[2] },
  aboutMeasure: { position: 'absolute', opacity: 0, left: 0, right: 0, zIndex: -1 },
  shotFrame: { gap: space[2] },
  shot: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.base, backgroundColor: colors.surfaceLight },
  shotNav: { flexDirection: 'row', gap: space[2] },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  barLabel: { width: 20, fontFamily: face.mono[400], fontSize: typeScale.xs.size, color: colors.text, textAlign: 'right' },
  barTrack: { flex: 1, height: 8, backgroundColor: colors.surfaceLight, borderRadius: radius.bar, overflow: 'hidden' },
  barFill: { height: '100%' },
  barCount: { width: 64, fontFamily: face.mono[400], fontSize: typeScale.xs.size, color: colors.muted },
  review: { padding: space[3], gap: space[2] },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: space[3], flexWrap: 'wrap' },
  reviewUser: { fontFamily: face.mono[600], fontSize: typeScale.sm.size, lineHeight: typeScale.sm.line },
  reviewName: { fontFamily: face.body[600], fontSize: typeScale.sm.size, color: colors.text },
  boneTitle: { height: 36, width: '70%', backgroundColor: colors.surfaceLight, borderRadius: radius.base },
  boneCover: { width: 180, height: 240, backgroundColor: colors.surfaceLight, borderRadius: radius.base },
  boneScore: { height: 88, backgroundColor: colors.surfaceLight, borderRadius: radius.base },
})
