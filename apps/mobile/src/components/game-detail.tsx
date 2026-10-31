import type { GamePageData, GameReviewsPage, Taxon } from '@screenpeak/shared/api/games'
import { releaseYear } from '@screenpeak/shared/dates'
import type { LibraryWrite, ListWrite } from '@screenpeak/shared/api/writes'
import type { GameRatingsStats } from '@screenpeak/shared/types'
import { LIBRARY_SECTION_TITLE, libraryEmptyLine, libraryScoreText } from '@screenpeak/shared/library-copy'
import { Image } from 'expo-image'
import { useState } from 'react'
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'

import { igdbImageUri } from '@/lib/catalog-image'
import { communityScore, relTime, scoreGap, statusLabel, type ReviewListQuery } from '@/lib/game-page'
import type { CatalogueFilter } from '@/lib/routes'
import { colors, face, radius, space, text, tierColor, tracking, trackingPx, typeScale } from '@/theme'

import { AppHeader } from './app-header'
import { Avatar } from './avatar'
import { Button } from './button'
import { DataAttribution } from './data-attribution'
import { EmptyState } from './empty-state'
import { GameGallery } from './game-gallery'
import { LibrarySheet } from './library-sheet'
import { LibraryStatRow } from './library-stat-row'
import { ListPickerSheet } from './list-picker-sheet'
import { Panel } from './panel'
import { RateSheet } from './rate-sheet'
import { SectionHead } from './section-head'
import { Sheet, useSheetDismiss } from './sheet'

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
  onOpenCatalogue?: (filter: CatalogueFilter) => void
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

/** One Credits row: a label and the taxonomy links under it. */
function CreditTags({ label, rows, onOpen }: { label: string, rows: Taxon[], onOpen: (slug: string) => void }) {
  return (
    <>
      <Text style={text.label}>{label}</Text>
      <View style={styles.tags}>
        {rows.length === 0 ? <Text style={text.body}>—</Text> : rows.map(row => (
          <Button
            key={row.id}
            label={row.name}
            accessibilityLabel={`Browse ${row.name}`}
            variant="ghost"
            onPress={() => onOpen(row.slug)}
          />
        ))}
      </View>
    </>
  )
}

/** Six lines, with Read more only when the text runs past them. */
function About({ description }: { description: string }) {
  const [open, setOpen] = useState(false)
  const [fullHeight, setFullHeight] = useState(0)
  const [limitHeight, setLimitHeight] = useState(0)
  const overflows = fullHeight > limitHeight + 1 && limitHeight > 0
  return (
    <View style={styles.about}>
      <SectionHead>About</SectionHead>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.aboutMeasure}>
        <Text style={text.body} onLayout={event => setFullHeight(event.nativeEvent.layout.height)}>{description}</Text>
        <Text numberOfLines={6} style={text.body} onLayout={event => setLimitHeight(event.nativeEvent.layout.height)}>{description}</Text>
      </View>
      <Text numberOfLines={overflows && !open ? 6 : undefined} style={text.body}>{description}</Text>
      {overflows ? (
        <Button label={open ? 'Show less' : 'Read more'} variant="ghost" onPress={() => setOpen(current => !current)} />
      ) : null}
    </View>
  )
}

function ReviewCard({ name, avatarUrl, date, rating, body, onOpenProfile }: {
  name: string
  avatarUrl: string
  date: string
  rating: number
  body: string
  onOpenProfile?: () => void
}) {
  const nameText = <Text style={styles.reviewName}>{name}</Text>
  return (
    <Panel style={styles.review}>
      <View style={styles.reviewHead}>
        <Avatar alt={name} src={avatarUrl || null} size="sm" />
        {onOpenProfile ? (
          <Pressable accessibilityRole="link" accessibilityLabel={name} onPress={onOpenProfile}>{nameText}</Pressable>
        ) : nameText}
        <Text style={text.caption}>{relTime(date)}</Text>
        <Text style={[styles.reviewUser, { color: tierColor(rating) }]}>{rating} / 10</Text>
      </View>
      <Text style={text.body}>{body}</Text>
    </Panel>
  )
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
  const year = releaseYear(game.released)
  const esrb = game.esrb_rating
  const cover = igdbImageUri(game.cover_image_url)
  const shots = game.screenshots.flatMap(url => {
    const uri = igdbImageUri(url)
    return uri ? [uri] : []
  })
  const { width } = useWindowDimensions()
  const compact = width <= 375
  const [prompt, setPrompt] = useState(false)
  const [panel, setPanel] = useState<'rate' | 'save' | 'list' | null>(null)

  function openAccount(next: 'rate' | 'save' | 'list') {
    if (!signedIn) setPrompt(true)
    else setPanel(current => current === next ? null : next)
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
  const titleSize = compact ? typeScale['3xl'].size : typeScale['4xl'].size

  return (
    <View style={styles.screen}>
      <AppHeader onBack={onBack} />
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.content, compact && styles.contentCompact]}
        refreshControl={onRefresh
          ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
          : undefined}
      >
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
          {esrb ? (
            <Button
              label={esrb}
              accessibilityLabel={`Browse games rated ${esrb}`}
              variant="secondary"
              onPress={() => onOpenCatalogue?.({ esrb })}
            />
          ) : null}
        </View>

        <View style={styles.hero}>
          <View style={styles.cover}>
            {cover ? (
              <Image source={cover} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={`${game.name} cover`} />
            ) : (
              <Text style={styles.noCover}>No Cover</Text>
            )}
          </View>
          <View style={styles.heroFacts}>
            <View style={styles.heroFact}>
              <Text style={text.label}>Released</Text>
              <Text style={styles.heroValue}>{year ?? '—'}</Text>
            </View>
            <View style={styles.heroFact}>
              <Text style={text.label}>Community</Text>
              <Text style={styles.heroValue}>{community == null ? '—' : community}</Text>
            </View>
          </View>
        </View>

        <Panel style={styles.savePanel}>
          <Text style={text.label}>{LIBRARY_SECTION_TITLE}</Text>
          {inFile ? (
            <View style={styles.stack}>
              <View style={styles.libraryTop}>
                {viewer?.libraryEntry ? (
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>{statusLabel(viewer.libraryEntry.status)}</Text>
                  </View>
                ) : null}
                {yours != null ? (
                  <Text
                    accessibilityLabel={`Your score ${yours} out of 10`}
                    style={[styles.libraryScore, { color: tierColor(yours) }]}
                  >
                    {libraryScoreText(yours)}
                  </Text>
                ) : null}
              </View>
              {viewer?.libraryEntry ? (
                <LibraryStatRow entry={viewer.libraryEntry} rowGap={space[4]} itemGap={space[1.5]} />
              ) : null}
              {viewer?.review?.updated_at ? <Text style={text.caption}>Scored {relTime(viewer.review.updated_at)}</Text> : null}
              {!viewer?.libraryEntry && yours == null ? <Text style={text.body}>Saved, not scored yet</Text> : null}
            </View>
          ) : (
            <Text style={text.body}>{libraryEmptyLine(signedIn)}</Text>
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

        <RateSheet
          visible={panel === 'rate'}
          review={viewer?.review ?? null}
          onClose={() => setPanel(null)}
          onRate={onRate}
        />

        <LibrarySheet
          visible={panel === 'save'}
          entry={viewer?.libraryEntry ?? null}
          onClose={() => setPanel(null)}
          onSave={onSave}
          onRemove={onRemoveLibrary}
        />

        <ListPickerSheet
          visible={panel === 'list'}
          lists={viewer?.lists ?? []}
          listIdsGameIsIn={viewer?.listIdsGameIsIn ?? []}
          defaultPublic={viewer?.defaultListPrivacy ?? true}
          onClose={() => setPanel(null)}
          onAdd={onAddToList}
          onRemove={onRemoveFromList}
          onCreate={onCreateList}
        />

        <Sheet visible={prompt} title="Sign up" onClose={() => setPrompt(false)}>
          <AccountPrompt onSignIn={onSignIn} onSignUp={onSignUp} />
        </Sheet>

        <SectionHead>Credits</SectionHead>
        <CreditTags label="Platforms" rows={taxonomy.platforms} onOpen={platform => onOpenCatalogue?.({ platform })} />
        <CreditTags label="Developed by" rows={taxonomy.developers} onOpen={developer => onOpenCatalogue?.({ developer })} />
        <CreditTags label="Published by" rows={taxonomy.publishers} onOpen={publisher => onOpenCatalogue?.({ publisher })} />

        {game.description ? <About description={game.description} /> : null}

        <GameGallery shots={shots} />

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
          <Text style={text.body}>No one on ScreenPeak has scored {game.name} yet. Be the first to put it on the board.</Text>
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
        {reviewsLoading ? <Text style={text.caption}>Loading reviews</Text> : null}
        {reviewsNote ? (
          <View style={styles.stack}>
            <Text style={text.body}>{reviewsNote}</Text>
            <Button label="Retry reviews" variant="ghost" onPress={onRetryReviews} />
          </View>
        ) : null}
        {viewer?.review?.review ? (
          <ReviewCard
            name="You"
            avatarUrl={viewer.review.users.avatar_url}
            date={viewer.review.created_at}
            rating={viewer.review.rating}
            body={`“${viewer.review.review}”`}
          />
        ) : null}
        {reviews?.reviews.map(review => (
          <ReviewCard
            key={review.user_id}
            name={review.users.username}
            avatarUrl={review.users.avatar_url}
            date={review.created_at}
            rating={review.rating}
            body={review.review ? `“${review.review}”` : 'Scored it, no note.'}
            onOpenProfile={() => onOpenProfile?.(review.users.username)}
          />
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
            <Text style={text.caption}>Page {reviewsQuery.page} of {reviews.totalPages}</Text>
            {reviewsQuery.page < reviews.totalPages ? (
              <Button
                label="Next page"
                variant="secondary"
                onPress={() => onReviewsQuery?.({ ...reviewsQuery, page: reviewsQuery.page + 1 })}
              />
            ) : null}
          </View>
        ) : null}
        <View style={styles.reviewWrite}>
          <Button
            label={viewer?.review?.review ? 'Edit your review' : 'Write a review'}
            variant="secondary"
            onPress={() => openAccount('rate')}
          />
        </View>

        {game.reddit_url ? (
          <Elsewhere url={game.reddit_url} />
        ) : null}

        <DataAttribution />
      </ScrollView>
    </View>
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

function AccountPrompt({ onSignIn, onSignUp }: { onSignIn: () => void, onSignUp: () => void }) {
  const dismiss = useSheetDismiss()
  return (
    <>
      <Text style={text.body}>Sign up to rate, log, or list this game.</Text>
      <Button label="Sign up" onPress={() => dismiss(onSignUp)} />
      <Button label="Log in" variant="secondary" onPress={() => dismiss(onSignIn)} />
    </>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
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
  hero: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  heroFacts: { gap: space[3], justifyContent: 'center' },
  heroFact: { gap: space[1] },
  heroValue: {
    fontFamily: face.display[600],
    fontSize: typeScale.lg.size,
    lineHeight: typeScale.lg.line,
    color: colors.text,
  },
  cover: {
    width: 180,
    flexShrink: 0,
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
  savePanel: { padding: space[4], gap: space[3] },
  libraryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.full,
    paddingHorizontal: space[3],
    paddingVertical: space[1],
  },
  chipText: {
    fontFamily: face.mono[400],
    fontSize: typeScale.xs.size,
    letterSpacing: trackingPx(tracking.wide, typeScale.xs.size),
    textTransform: 'uppercase',
    color: colors.text,
  },
  libraryScore: {
    marginLeft: 'auto',
    fontFamily: face.display[600],
    fontSize: typeScale['2xl'].size,
    lineHeight: typeScale['2xl'].line,
  },
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
  link: {
    fontFamily: face.mono[400],
    fontSize: typeScale.sm.size,
    color: colors.accent,
    textDecorationLine: 'underline',
  },
  about: { position: 'relative', gap: space[2] },
  aboutMeasure: { position: 'absolute', opacity: 0, left: 0, right: 0, zIndex: -1 },
  reviewWrite: { alignItems: 'flex-end' },
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
