// Port of apps/web/app/user/[username]/ratings_reviews/page.tsx. The website
// pages with numbered links; the phone loads the next page near the end.
import type { UserReviewItem, UserReviewsPage } from '@screenpeak/shared/api/user-reviews'
import { releaseYear } from '@screenpeak/shared/dates'
import { ratingsEmpty } from '@screenpeak/shared/ratings-copy'
import { Image } from 'expo-image'
import { ArrowLeft } from 'lucide-react-native'
import { useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { igdbImageUri } from '@/lib/catalog-image'
import { reviewDateLabel } from '@/lib/profile-hub'
import { ratingsCountLine, type RatingsQuery } from '@/lib/ratings-page'
import { gameHref, profileHref } from '@/lib/routes'
import { colors, face, hitTarget, radius, space, text, tierColor, typeScale } from '@/theme'

import { AppHeader } from './app-header'
import { Button } from './button'
import { ClampedText } from './clamped-text'
import { EmptyState } from './empty-state'
import { MenuTrigger, SortToggle } from './filter-controls'
import { MoreFooter } from './more-footer'
import { Panel } from './panel'
import { Sheet } from './sheet'

type Open = (href: string) => void

const SHOWS: { filter: RatingsQuery['filter'], label: string }[] = [
  { filter: 'all', label: 'All' },
  { filter: 'reviews', label: 'Reviews' },
  { filter: 'ratings', label: 'Ratings' },
]

const SORTS: { sort: RatingsQuery['sort'], label: string }[] = [
  { sort: 'date', label: 'Date' },
  { sort: 'rating', label: 'Rating' },
]

const REVIEW_LINES = 4
const REVIEW_CLAMP_CHARS = 220

export type RatingsScreenProps = {
  username: string
  counts: UserReviewsPage['counts']
  items: UserReviewItem[]
  query: RatingsQuery
  onQuery: (query: RatingsQuery) => void
  onOpen: Open
  onBack: () => void
  hasMore: boolean
  loadingMore: boolean
  loadMoreError: string | null
  onLoadMore: () => void
  refreshing: boolean
  onRefresh: () => void
  refreshError: string | null
  onRetry: () => void
  /** A new Show or Sort is loading while the previous rows stay on screen. */
  updating?: boolean
}

function GameLine({ item, coverWidth }: { item: UserReviewItem, coverWidth: number }) {
  const cover = igdbImageUri(item.cover_image_url)
  const meta = [releaseYear(item.released), item.developer].filter(Boolean).join(' · ')
  const day = reviewDateLabel(item.updated_at)
  return (
    <View style={styles.line}>
      <View style={[styles.cover, { width: coverWidth }]}>
        {cover ? <Image source={cover} recyclingKey={item.game_id} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      </View>
      <View style={styles.body}>
        <Text numberOfLines={2} style={styles.name}>{item.game_name}</Text>
        {meta ? <Text numberOfLines={1} style={styles.meta}>{meta}</Text> : null}
      </View>
      <View style={styles.end}>
        <Text style={[styles.score, { color: tierColor(item.rating) }]}>
          {item.rating}<Text style={styles.outOf}>/10</Text>
        </Text>
        {day ? <Text style={styles.meta}>{day}</Text> : null}
      </View>
    </View>
  )
}

function Row({ item, onOpen }: { item: UserReviewItem, onOpen: Open }) {
  const open = () => onOpen(gameHref(item.game_slug))
  const label = `${item.game_name}, ${item.rating} out of 10`
  if (!item.review) {
    return (
      <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={open} style={styles.ratingRow}>
        <GameLine item={item} coverWidth={32} />
      </Pressable>
    )
  }
  return (
    <Panel style={styles.review}>
      <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={open}>
        <GameLine item={item} coverWidth={56} />
      </Pressable>
      <ClampedText text={item.review} lines={REVIEW_LINES} longerThan={REVIEW_CLAMP_CHARS} style={styles.reviewText} />
    </Panel>
  )
}

export function RatingsScreen({
  username,
  counts,
  items,
  query,
  onQuery,
  onOpen,
  onBack,
  hasMore,
  loadingMore,
  loadMoreError,
  onLoadMore,
  refreshing,
  onRefresh,
  refreshError,
  onRetry,
  updating = false,
}: RatingsScreenProps) {
  const { width } = useWindowDimensions()
  const compact = width <= 375
  const [menu, setMenu] = useState<null | 'show' | 'sort'>(null)
  const empty = ratingsEmpty(query.filter, username)

  const header = (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${username}'s profile`}
        onPress={() => onOpen(profileHref(username))}
        style={styles.profileLink}
      >
        <ArrowLeft size={16} color={colors.muted} />
        <Text style={styles.profileText}>{`${username}'s profile`}</Text>
      </Pressable>
      <Text accessibilityRole="header" style={styles.title}>{`${username}'s Ratings & Reviews`}</Text>
      <Text style={styles.counts}>{ratingsCountLine(counts)}</Text>
      <View style={styles.controlRow}>
        <MenuTrigger label={`Show: ${SHOWS.find(show => show.filter === query.filter)?.label ?? 'All'}`} onPress={() => setMenu('show')} />
      </View>
      <View style={styles.controlRow}>
        <MenuTrigger label={`Sort: ${SORTS.find(sort => sort.sort === query.sort)?.label ?? 'Date'}`} onPress={() => setMenu('sort')} />
        <SortToggle order={query.order} onToggle={() => onQuery({ ...query, order: query.order === 'desc' ? 'asc' : 'desc' })} />
        {updating ? <ActivityIndicator accessibilityLabel="Updating ratings" color={colors.accent} /> : null}
      </View>
      {refreshError ? (
        <View style={styles.stack}>
          <Text accessibilityLiveRegion="polite" style={text.error}>{refreshError}</Text>
          <Button label="Retry" variant="secondary" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  )

  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader onBack={onBack} />
      <FlatList
        data={items}
        keyExtractor={item => item.game_id}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasMore && !loadingMore && !loadMoreError) onLoadMore()
        }}
        contentContainerStyle={[styles.list, compact && styles.listCompact]}
        ListHeaderComponent={header}
        ListEmptyComponent={<EmptyState dense title={empty.title} description={empty.description} />}
        ListFooterComponent={<MoreFooter loadingLabel="Loading more ratings" loadingMore={loadingMore} loadMoreError={loadMoreError} onLoadMore={onLoadMore} />}
        renderItem={({ item }) => <Row item={item} onOpen={onOpen} />}
      />
      <Sheet visible={menu != null} title={menu === 'sort' ? 'Sort' : 'Show'} onClose={() => setMenu(null)}>
        {menu === 'show' ? SHOWS.map(show => (
          <Button
            key={show.filter}
            label={show.label}
            selected={query.filter === show.filter}
            variant="secondary"
            onPress={() => {
              onQuery({ ...query, filter: show.filter })
              setMenu(null)
            }}
          />
        )) : null}
        {menu === 'sort' ? SORTS.map(sort => (
          <Button
            key={sort.sort}
            label={sort.label}
            selected={query.sort === sort.sort}
            variant="secondary"
            onPress={() => {
              // Newest first, or highest first.
              onQuery({ ...query, sort: sort.sort, order: 'desc' })
              setMenu(null)
            }}
          />
        )) : null}
      </Sheet>
    </SafeAreaView>
  )
}

export function RatingsSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <SafeAreaView accessibilityLabel="Loading ratings" style={styles.screen}>
      <AppHeader onBack={onBack} />
      <View style={styles.skeleton}>
        <View style={styles.boneTitle} />
        <View style={styles.boneRow} />
        <View style={styles.boneRow} />
        <View style={styles.boneRow} />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: space[6], paddingBottom: space[10], gap: space[3] },
  listCompact: { paddingHorizontal: space[4] },
  header: { gap: space[3], paddingTop: space[4], paddingBottom: space[2] },
  profileLink: { flexDirection: 'row', alignItems: 'center', gap: space[2], alignSelf: 'flex-start', minHeight: hitTarget },
  profileText: { fontFamily: face.display[600], fontSize: typeScale.sm.size, color: colors.muted },
  title: {
    fontFamily: face.display[700],
    fontSize: typeScale['3xl'].size,
    lineHeight: typeScale['3xl'].line,
    color: colors.text,
  },
  counts: { fontFamily: face.mono[400], fontSize: typeScale.sm.size, lineHeight: typeScale.sm.line, color: colors.muted },
  controlRow: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: space[2] },
  stack: { gap: space[2] },
  ratingRow: { minHeight: hitTarget, justifyContent: 'center', paddingVertical: space[1] },
  review: { gap: space[2], padding: space[3] },
  line: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  cover: { aspectRatio: 3 / 4, borderRadius: radius.base, overflow: 'hidden', backgroundColor: colors.surfaceLight },
  body: { flex: 1, minWidth: 0, gap: space[0.5] },
  name: { fontFamily: face.display[600], fontSize: typeScale.sm.size, lineHeight: typeScale.sm.line, color: colors.text },
  meta: { fontFamily: face.body[400], fontSize: typeScale.xs.size, lineHeight: typeScale.xs.line, color: colors.muted },
  end: { alignItems: 'flex-end', gap: space[0.5], flexShrink: 0 },
  score: { fontFamily: face.mono[600], fontSize: typeScale.sm.size, lineHeight: typeScale.sm.line },
  outOf: { fontFamily: face.mono[400], fontSize: typeScale.xs.size, color: colors.muted },
  reviewText: { fontFamily: face.body[400], fontSize: typeScale.sm.size, lineHeight: typeScale.sm.line * 1.15, color: colors.text },
  skeleton: { paddingHorizontal: space[6], paddingTop: space[4], gap: space[3] },
  boneTitle: { height: 28, width: '60%', backgroundColor: colors.surfaceLight, borderRadius: radius.base },
  boneRow: { height: hitTarget, backgroundColor: colors.surfaceLight, borderRadius: radius.base },
})
