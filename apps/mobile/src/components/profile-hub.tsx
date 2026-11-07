import type { GameSearchHit } from '@screenpeak/shared/api/search'
import { Crosshair, Library, List } from 'lucide-react-native'
import { useState, type ReactNode } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import type { ProfileHubModel } from '@/lib/profile-hub'
import { averageText, reviewDateLabel } from '@/lib/profile-hub'
import { gameHref } from '@/lib/routes'
import { colors, face, hitTarget, radius, seam, space, text, tierColor, tracking, trackingPx, typeScale } from '@/theme'

import { Avatar } from './avatar'
import { Button } from './button'
import { EmptyState } from './empty-state'
import { FavoritesSheet } from './favorites-sheet'
import { GameCard } from './game-card'
import { Panel } from './panel'
import { AppHeader } from './app-header'
import { PanelRow } from './screen-scroll'
import { SectionHead } from './section-head'

function libraryCopy(library: NonNullable<ProfileHubModel['library']>): { label: string, text: string } {
  if (library.totalGames == null || library.completed == null) {
    return { label: 'Library', text: 'Library' }
  }
  return {
    label: `Library, ${library.totalGames} games, ${library.completed} completed`,
    text: `${library.totalGames} games · ${library.completed} completed`,
  }
}

function countLine(followers: number, following: number): string {
  const followerWord = followers === 1 ? 'follower' : 'followers'
  return `${followers} ${followerWord} · ${following} following`
}

function HubRow({
  label,
  title,
  icon,
  onPress,
}: {
  label: string
  title: string
  icon: ReactNode
  onPress: () => void
}) {
  return (
    <PanelRow accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
      <View style={styles.hubRow}>
        {icon}
        <Text style={text.body}>{title}</Text>
      </View>
    </PanelRow>
  )
}

function HubSegment({ label, title, icon, onPress }: {
  label: string
  title: string
  icon: ReactNode
  onPress: () => void
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.hubSegment}>
      <View style={styles.hubRow}>
        {icon}
        <Text style={text.body}>{title}</Text>
      </View>
    </Pressable>
  )
}

/** Loadout and Lists share one box with a seam divider — Loadout drops out (not a two-way split) when it's gated off. */
function HubSplit({ loadoutHref, listsHref, onOpen }: {
  loadoutHref: string | null
  listsHref: string
  onOpen: (href: string) => void
}) {
  return (
    <View style={styles.hubSplit}>
      {loadoutHref ? (
        <>
          <HubSegment label="Loadout" title="Loadout" icon={<Crosshair size={18} color={colors.accent} />} onPress={() => onOpen(loadoutHref)} />
          <View style={styles.hubDivider} />
        </>
      ) : null}
      <HubSegment label="Lists" title="Lists" icon={<List size={18} color={colors.accent} />} onPress={() => onOpen(listsHref)} />
    </View>
  )
}

function Stat({ label, value }: { label: string, value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

/**
 * Loadout, Lists, and the library preview render only when `model` includes them.
 * Settings and the favorites editor show on your own profile; the editor needs both handlers.
 */
export function ProfileHub({
  model,
  onOpen,
  onBack,
  onFollow,
  onUnfollow,
  followBusy = false,
  followNote,
  refreshing = false,
  onRefresh,
  onSearchGames,
  onSaveFavorites,
}: {
  model: ProfileHubModel
  onOpen: (href: string) => void
  onBack?: () => void
  onFollow?: () => void
  onUnfollow?: () => void
  followBusy?: boolean
  followNote?: string | null
  refreshing?: boolean
  onRefresh?: () => void
  onSearchGames?: (query: string) => Promise<GameSearchHit[]>
  /** Saves the ids in order. The failure sentence, or null. */
  onSaveFavorites?: (gameIds: string[]) => Promise<string | null>
}) {
  const { width } = useWindowDimensions()
  const [pickingFavorites, setPickingFavorites] = useState(false)
  const canPickFavorites = model.isOwner && onSearchGames != null && onSaveFavorites != null
  const compact = width <= 375
  const library = model.library ? libraryCopy(model.library) : null
  const favoriteEmpty = model.isOwner
    ? { title: 'No favorite games yet', description: "Pin a few games you love and they'll show up here." }
    : { title: 'No favorite games yet', description: "This player hasn't picked any favorites yet." }
  const reviewEmpty = model.isOwner
    ? { title: 'No reviews yet', description: 'Rate and review a game to start building your record.' }
    : { title: 'No reviews yet', description: "This player hasn't reviewed anything yet." }

  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader onBack={onBack} />
      <ScrollView
        contentContainerStyle={[styles.content, compact && styles.contentCompact]}
        refreshControl={onRefresh
          ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
          : undefined}
      >
        <View style={styles.header}>
          <Avatar alt={model.username} src={model.avatarUrl} size="lg" />
          <View style={styles.identity}>
            <View style={styles.kicker}>
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.seam} />
              <Text style={styles.kickerText}>Player card</Text>
            </View>
            <Text role="heading" accessibilityRole="header" accessibilityLevel={1} style={styles.name}>{model.displayName}</Text>
            <Text style={styles.handle}>@{model.username}</Text>
            <Text style={styles.titleLine}>{model.title}</Text>
            {model.memberSince ? <Text style={text.meta}>{model.memberSince}</Text> : null}
            <Text style={text.meta}>{countLine(model.followerCount, model.followingCount)}</Text>
          </View>
        </View>
        <View style={styles.actionRow}>
          {model.following != null ? (
            <Button
              label={model.following ? 'Following' : 'Follow'}
              accessibilityLabel={model.following ? `Unfollow ${model.username}` : `Follow ${model.username}`}
              variant={model.following ? 'secondary' : 'primary'}
              disabled={followBusy}
              onPress={() => { if (model.following) onUnfollow?.(); else onFollow?.() }}
              style={styles.follow}
            />
          ) : null}
          {model.settingsHref ? (
            <Button
              label="Settings"
              variant="secondary"
              onPress={() => { if (model.settingsHref) onOpen(model.settingsHref) }}
              style={styles.fill}
            />
          ) : null}
        </View>
        {followNote ? <Text accessibilityLiveRegion="polite" style={styles.note}>{followNote}</Text> : null}
        <Text style={model.bio ? text.body : text.muted}>
          {model.bio ?? (model.isOwner ? "You haven't written a bio yet." : 'No bio yet.')}
        </Text>

        <HubSplit loadoutHref={model.loadoutHref} listsHref={model.listsHref} onOpen={onOpen} />
        {model.library && library ? (
          <HubRow
            label={library.label}
            title={library.text}
            icon={<Library size={18} color={colors.accent} />}
            onPress={() => { if (model.library) onOpen(model.library.href) }}
          />
        ) : null}

        <View style={styles.stats}>
          {model.library && library && model.library.totalGames != null && model.library.completed != null ? (
            <>
              <Stat label="Games" value={String(model.library.totalGames)} />
              <Stat label="Completed" value={String(model.library.completed)} />
            </>
          ) : null}
          <Stat label="Rated" value={String(model.ratedCount)} />
          <Stat label="Avg" value={averageText(model.ratedCount, model.avgRating)} />
        </View>
        {model.loadoutQuote ? <Text style={styles.quote}>{`“${model.loadoutQuote}”`}</Text> : null}

        <SectionHead
          action={canPickFavorites
            ? <Button label="Edit" accessibilityLabel="Edit favorite games" variant="ghost" onPress={() => setPickingFavorites(true)} />
            : undefined}
        >
          Favorite games
        </SectionHead>
        {model.favorites.length > 0 ? (
          <View style={styles.favorites}>
            {model.favorites.map(game => (
              <View key={game.id} style={styles.favorite}>
                <GameCard
                  game={{
                    id: game.id,
                    name: game.name,
                    slug: game.slug,
                    cover_image_url: game.cover_image_url,
                    released: game.released,
                  }}
                  developer={game.developer}
                  spRating={game.avg_rating}
                  userRating={game.user_rating}
                  onPress={() => onOpen(gameHref(game.slug))}
                />
              </View>
            ))}
          </View>
        ) : (
          <>
            <EmptyState dense title={favoriteEmpty.title} description={favoriteEmpty.description} />
            {canPickFavorites
              ? <Button label="Pick favorite games" variant="secondary" onPress={() => setPickingFavorites(true)} />
              : null}
          </>
        )}

        <SectionHead>Recent reviews</SectionHead>
        <Button label="View all reviews" variant="ghost" onPress={() => onOpen(model.reviewsHref)} />
        {model.reviews.length > 0 ? model.reviews.map(review => (
          <Panel key={`${review.games.slug}-${review.created_at}`} style={styles.review}>
            <View style={styles.reviewHead}>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={review.games.name}
                onPress={() => onOpen(gameHref(review.games.slug))}
                style={styles.reviewLink}
              >
                <Text numberOfLines={1} style={styles.reviewGame}>{review.games.name}</Text>
              </Pressable>
              <Text style={[styles.score, { color: tierColor(review.rating) }]}>{review.rating} / 10</Text>
            </View>
            {reviewDateLabel(review.created_at) ? <Text style={text.meta}>{reviewDateLabel(review.created_at)}</Text> : null}
            {review.review ? <Text style={text.body}>{review.review}</Text> : null}
          </Panel>
        )) : (
          <EmptyState dense title={reviewEmpty.title} description={reviewEmpty.description} />
        )}
      </ScrollView>
      {canPickFavorites ? (
        <FavoritesSheet
          visible={pickingFavorites}
          current={model.favorites.map(game => ({ id: game.id, name: game.name }))}
          onClose={() => setPickingFavorites(false)}
          onSearch={onSearchGames}
          onSave={onSaveFavorites}
        />
      ) : null}
    </SafeAreaView>
  )
}

export function ProfileHubSkeleton() {
  return (
    <View accessibilityLabel="Loading profile" style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.boneAvatar} />
        <View style={styles.boneLine} />
        <View style={styles.boneShort} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[6], paddingTop: space[6], paddingBottom: space[12], gap: space[3] },
  contentCompact: { paddingHorizontal: space[4] },
  header: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  identity: { flexGrow: 1, flexShrink: 1, minWidth: 140, gap: space[0.5] },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  seam: { width: seam.width, height: 12, backgroundColor: seam.color },
  kickerText: {
    fontFamily: face.mono[600],
    fontSize: typeScale.eyebrow.size,
    lineHeight: typeScale.eyebrow.line,
    letterSpacing: trackingPx(tracking.label, typeScale.eyebrow.size),
    textTransform: 'uppercase',
    color: colors.muted,
  },
  name: {
    fontFamily: face.display[600],
    fontSize: typeScale['3xl'].size,
    lineHeight: typeScale['3xl'].line,
    color: colors.text,
  },
  handle: {
    fontFamily: face.mono[400],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.muted,
  },
  titleLine: {
    fontFamily: face.display[600],
    fontSize: typeScale.lg.size,
    lineHeight: typeScale.lg.line,
    color: colors.text,
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  follow: { flexGrow: 1 },
  fill: { flexGrow: 1 },
  note: {
    fontFamily: face.body[400],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.bad,
  },
  hubRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  hubSplit: {
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    backgroundColor: colors.surface,
    boxShadow: `inset 0 1px 0 ${colors.highlight}`,
  },
  hubSegment: { flex: 1, minHeight: hitTarget, justifyContent: 'center', paddingHorizontal: space[3], paddingVertical: space[3] },
  hubDivider: { width: seam.width, backgroundColor: seam.color },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  stat: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    paddingVertical: space[3],
    paddingHorizontal: space[2],
    alignItems: 'center',
  },
  statValue: {
    fontFamily: face.mono[600],
    fontSize: typeScale['2xl'].size,
    lineHeight: typeScale['2xl'].line,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontFamily: face.mono[400],
    fontSize: typeScale.eyebrow.size,
    lineHeight: typeScale.eyebrow.line,
    letterSpacing: trackingPx(tracking.label, typeScale.eyebrow.size),
    textTransform: 'uppercase',
    color: colors.muted,
  },
  quote: {
    fontFamily: face.display[400],
    fontSize: typeScale.lg.size,
    lineHeight: typeScale.lg.line,
    color: colors.text,
    textAlign: 'center',
  },
  favorites: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  favorite: { width: '48%', flexGrow: 1 },
  review: { padding: space[3], gap: space[2] },
  reviewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  reviewLink: { flex: 1, flexShrink: 1, minHeight: hitTarget, justifyContent: 'center' },
  reviewGame: {
    flexShrink: 1,
    fontFamily: face.display[600],
    fontSize: typeScale.base.size,
    lineHeight: typeScale.base.line,
    color: colors.text,
  },
  score: {
    flexShrink: 0,
    fontFamily: face.mono[600],
    fontSize: typeScale.lg.size,
    lineHeight: typeScale.lg.line,
    fontVariant: ['tabular-nums'],
  },
  boneAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.surfaceLight },
  boneLine: { height: 18, width: '70%', borderRadius: radius.base, backgroundColor: colors.surfaceLight },
  boneShort: { height: 14, width: '40%', borderRadius: radius.base, backgroundColor: colors.surfaceLight },
})
