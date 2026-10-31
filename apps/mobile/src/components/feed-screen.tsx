import { releaseYear } from '@screenpeak/shared/dates'
import { FEED_EMPTY, feedActivityPhrase, timeAgo } from '@screenpeak/shared/feed-copy'
import type { FeedItem } from '@screenpeak/shared/types'
import { Image } from 'expo-image'
import { Bookmark, Heart, List, MessageSquare, Star } from 'lucide-react-native'
import { useState, type ReactNode } from 'react'
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { igdbImageUri } from '@/lib/catalog-image'
import { feedItemKey } from '@/lib/feed-page'
import { gamesLabel } from '@/lib/lists-page'
import { gameHref, listHref, profileHref, userLibraryHref } from '@/lib/routes'
import { colors, face, hitTarget, radius, space, text, typeScale } from '@/theme'

import { AppHeader } from './app-header'
import { Avatar } from './avatar'
import { Button } from './button'
import { CoverStrip } from './cover-strip'
import { EmptyState } from './empty-state'
import { MoreFooter } from './more-footer'
import { ListLike } from './list-chrome'
import { Seal } from './seal'
import { WelcomeScreen } from './welcome-screen'

// The web clamps a review to three lines and measures the overflow. The phone
// cannot measure a clamped Text, so a review this long gets Read more.
const REVIEW_CLAMP_CHARS = 160
const REVIEW_LINES = 3

type Open = (href: string) => void

/** A glyph per activity type so the feed scans without reading every line. */
function ActivityIcon({ type }: { type: string }) {
  const Icon = type === 'rating' ? Star
    : type === 'review' ? MessageSquare
    : type === 'list_created' ? List
    : type === 'list_liked' ? Heart
    : Bookmark
  return <Icon size={13} color={colors.muted} />
}

function Cover({ uri, name, children }: { uri: string | null, name: string, children?: ReactNode }) {
  const source = igdbImageUri(uri)
  return (
    <View style={styles.cover}>
      {source
        ? <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={name} />
        : <View style={styles.noCover}><Text style={styles.noCoverText}>No cover</Text></View>}
      {children}
    </View>
  )
}

function releaseLine(item: FeedItem): string {
  return [releaseYear(item.game_released), item.game_developer].filter(Boolean).join(' · ')
}

/** A library add or a rating: the cover with one score tag, then the title. */
function GameBody({ item, onOpen }: { item: FeedItem, onOpen: Open }) {
  const name = item.game_name ?? ''
  const meta = releaseLine(item)
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={name} onPress={() => onOpen(gameHref(item.game_slug ?? ''))} style={styles.gameRow}>
      <Cover uri={item.game_cover_image_url} name={name}>
        {item.game_avg_rating
          ? <Seal label="SP" score={item.game_avg_rating} side="right" />
          : item.viewer_game_rating ? <Seal label="You" score={item.viewer_game_rating} side="right" /> : null}
      </Cover>
      <View style={styles.gameText}>
        <Text numberOfLines={2} style={styles.name}>{name}</Text>
        {meta ? <Text style={text.meta}>{meta}</Text> : null}
      </View>
    </Pressable>
  )
}

function ReviewBody({ item, onOpen }: { item: FeedItem, onOpen: Open }) {
  const [expanded, setExpanded] = useState(false)
  const name = item.game_name ?? ''
  const review = item.review ?? ''
  const long = review.length > REVIEW_CLAMP_CHARS
  const openGame = () => onOpen(gameHref(item.game_slug ?? ''))
  return (
    <View style={styles.gameRow}>
      <Pressable accessibilityElementsHidden importantForAccessibility="no-hide-descendants" onPress={openGame}>
        <Cover uri={item.game_cover_image_url} name={name}>
          {item.rating ? <Seal score={item.rating} side="right" /> : null}
        </Cover>
      </Pressable>
      <View style={styles.gameText}>
        <Pressable accessibilityRole="link" accessibilityLabel={name} onPress={openGame} style={styles.nameLink}>
          <Text numberOfLines={2} style={styles.name}>{name}</Text>
        </Pressable>
        {review ? <Text numberOfLines={long && !expanded ? REVIEW_LINES : undefined} style={styles.review}>{review}</Text> : null}
        {long ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Show less' : 'Read more'}
            onPress={() => setExpanded(value => !value)}
            style={styles.toggle}
          >
            <Text style={styles.toggleText}>{expanded ? 'Show less' : 'Read more'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

function ListBody({ item, onOpen }: { item: FeedItem, onOpen: Open }) {
  const name = item.list_name ?? ''
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={name}
      onPress={() => onOpen(listHref(item.list_owner_username ?? '', item.list_id ?? ''))}
      style={styles.listBody}
    >
      <Text numberOfLines={2} style={styles.name}>{name}</Text>
      {item.list_description ? <Text numberOfLines={2} style={styles.description}>{item.list_description}</Text> : null}
      <View style={styles.listMeta}>
        <ListLike count={item.list_like_count ?? 0} liked={item.viewer_liked_list ?? false} interactive={false} />
        <Text style={text.meta}>·</Text>
        <Text style={text.meta}>{gamesLabel(item.list_game_count ?? 0)}</Text>
      </View>
      <CoverStrip covers={item.list_cover_urls ?? []} />
    </Pressable>
  )
}

function BatchBody({ item, onOpen }: { item: FeedItem, onOpen: Open }) {
  const covers = item.library_cover_urls ?? []
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${item.actor_username}'s library`}
      onPress={() => onOpen(userLibraryHref(item.actor_username))}
      style={styles.batchBody}
    >
      {covers.length > 0 ? <CoverStrip covers={covers} /> : <Text style={text.meta}>View library</Text>}
    </Pressable>
  )
}

function FeedCard({ item, now, onOpen }: { item: FeedItem, now: number, onOpen: Open }) {
  const ago = timeAgo(item.created_at, now)
  const type = item.activity_type
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Avatar src={item.actor_avatar_url} alt={item.actor_username} size="sm" />
        </View>
        <Text style={styles.line}>
          <Text accessibilityRole="link" onPress={() => onOpen(profileHref(item.actor_username))} style={styles.actor}>
            {item.actor_username}
          </Text>
          {' '}{feedActivityPhrase(item)}
        </Text>
        <View accessible accessibilityLabel={ago} style={styles.when}>
          <ActivityIcon type={type} />
          <Text style={text.caption}>{ago}</Text>
        </View>
      </View>
      {type === 'library_add' || type === 'rating' ? <GameBody item={item} onOpen={onOpen} /> : null}
      {type === 'review' ? <ReviewBody item={item} onOpen={onOpen} /> : null}
      {type === 'list_created' || type === 'list_liked' ? <ListBody item={item} onOpen={onOpen} /> : null}
      {type === 'library_add_batch' ? <BatchBody item={item} onOpen={onOpen} /> : null}
    </View>
  )
}

export type FeedScreenProps = {
  signedIn: boolean
  items: FeedItem[]
  onOpen: Open
  /** What "3h ago" counts from: when the items loaded. Defaults to when the screen mounted. */
  now?: number
  hasMore?: boolean
  loadingMore?: boolean
  loadMoreError?: string | null
  onLoadMore?: () => void
  refreshing?: boolean
  onRefresh?: () => void
  refreshError?: string | null
  onRetry?: () => void
}

/** Signed out: the welcome screen. Signed in: followed players' activity, a page at a time. */
export function FeedScreen({
  signedIn,
  items,
  onOpen,
  now,
  hasMore = false,
  loadingMore = false,
  loadMoreError = null,
  onLoadMore,
  refreshing = false,
  onRefresh,
  refreshError = null,
  onRetry,
}: FeedScreenProps) {
  const { width } = useWindowDimensions()
  const [mountedAt] = useState(() => Date.now())
  const clock = now ?? mountedAt
  if (!signedIn) return <WelcomeScreen onOpen={onOpen} />
  const compact = width <= 375

  const header = (
    <View style={styles.header}>
      <Text role="heading" accessibilityRole="header" accessibilityLevel={1} style={styles.title}>Feed</Text>
      {refreshError ? (
        <View style={styles.stack}>
          <Text accessibilityLiveRegion="polite" style={text.error}>{refreshError}</Text>
          {onRetry ? <Button label="Retry" variant="secondary" onPress={onRetry} /> : null}
        </View>
      ) : null}
    </View>
  )

  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader />
      <FlatList
        data={items}
        keyExtractor={feedItemKey}
        renderItem={({ item }) => <FeedCard item={item} now={clock} onOpen={onOpen} />}
        ListHeaderComponent={header}
        ListEmptyComponent={(
          <EmptyState
            dense
            title={FEED_EMPTY.title}
            description={FEED_EMPTY.description}
            actionLabel={FEED_EMPTY.actionLabel}
            onAction={() => onOpen('/explore')}
          />
        )}
        ListFooterComponent={<MoreFooter loadingLabel="Loading more activity" loadingMore={loadingMore} loadMoreError={loadMoreError} onLoadMore={onLoadMore} />}
        onEndReached={() => {
          if (hasMore && !loadingMore && !loadMoreError) onLoadMore?.()
        }}
        onEndReachedThreshold={0.5}
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={[styles.list, compact && styles.listCompact]}
      />
    </SafeAreaView>
  )
}

export function FeedSkeleton() {
  return (
    <SafeAreaView accessibilityLabel="Loading feed" style={styles.screen}>
      <AppHeader />
      <View style={[styles.list, styles.header]}>
        <View style={styles.boneTitle} />
        {[0, 1, 2].map(index => <View key={index} style={styles.boneCard} />)}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: space[6], paddingBottom: space[10] },
  listCompact: { paddingHorizontal: space[4] },
  header: { gap: space[3], paddingTop: space[4], paddingBottom: space[3] },
  title: {
    fontFamily: face.display[600],
    fontSize: typeScale['3xl'].size,
    lineHeight: typeScale['3xl'].line,
    color: colors.text,
  },
  card: {
    gap: space[2],
    padding: space[4],
    marginBottom: space[3],
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    backgroundColor: colors.surface,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  line: {
    flex: 1,
    fontFamily: face.body[400],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.muted,
  },
  actor: { fontFamily: face.body[600], color: colors.text },
  when: { flexDirection: 'row', alignItems: 'center', gap: space[1.5], flexShrink: 0 },
  gameRow: { flexDirection: 'row', gap: space[4], paddingVertical: space[1], minHeight: hitTarget },
  cover: {
    width: 80,
    aspectRatio: 3 / 4,
    borderRadius: radius.base,
    overflow: 'hidden',
    backgroundColor: colors.surfaceLight,
  },
  noCover: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noCoverText: {
    fontFamily: face.mono[400],
    fontSize: 8,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  gameText: { flex: 1, minWidth: 0, justifyContent: 'center', gap: space[1] },
  name: {
    fontFamily: face.display[700],
    fontSize: typeScale.base.size,
    lineHeight: typeScale.base.line,
    color: colors.text,
  },
  nameLink: { alignSelf: 'flex-start' },
  review: {
    fontFamily: face.body[400],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line * 1.15,
    color: colors.muted,
  },
  toggle: { alignSelf: 'flex-start', minHeight: hitTarget, justifyContent: 'center' },
  toggleText: { fontFamily: face.body[600], fontSize: typeScale.sm.size, color: colors.accent },
  listBody: { gap: space[2], minHeight: hitTarget },
  description: {
    fontFamily: face.body[400],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.muted,
  },
  listMeta: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  batchBody: { minHeight: hitTarget, justifyContent: 'center' },
  stack: { gap: space[2] },
  boneTitle: { height: 28, width: '40%', backgroundColor: colors.surfaceLight, borderRadius: radius.base },
  boneCard: { height: 132, backgroundColor: colors.surfaceLight, borderRadius: radius.base },
})
