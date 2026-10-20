import { Crosshair, Library, List, Pencil } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import type { ProfileHubModel } from '@/lib/profile-hub'
import { averageText, calendarLabel } from '@/lib/profile-hub'
import { gameHref } from '@/lib/routes'
import { colors, face, hitTarget, radius, seam, space, tierColor, tracking, trackingPx, typeScale } from '@/theme'

import { Avatar } from './avatar'
import { Button } from './button'
import { EmptyState } from './empty-state'
import { GameCard } from './game-card'
import { Panel } from './panel'
import { screenStyles, PanelRow } from './screen-scroll'
import { SectionHead } from './section-head'
import { Wordmark } from './wordmark'

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
  text,
  icon,
  onPress,
}: {
  label: string
  text: string
  icon: ReactNode
  onPress: () => void
}) {
  return (
    <PanelRow accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
      <View style={styles.hubRow}>
        {icon}
        <Text style={screenStyles.body}>{text}</Text>
      </View>
    </PanelRow>
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

/** Loadout, Lists, and the library preview render only when `model` includes them. */
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
}) {
  const { width } = useWindowDimensions()
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
      <ScrollView
        contentContainerStyle={[styles.content, compact && styles.contentCompact]}
        refreshControl={onRefresh
          ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
          : undefined}
      >
        <Wordmark />
        {onBack ? <Button label="Back" variant="ghost" onPress={onBack} /> : null}
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
            {model.memberSince ? <Text style={styles.meta}>{model.memberSince}</Text> : null}
            <Text style={styles.meta}>{countLine(model.followerCount, model.followingCount)}</Text>
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit profile"
              onPress={() => { if (model.settingsHref) onOpen(model.settingsHref) }}
              style={styles.iconButton}
            >
              <Pencil size={18} color={colors.accent} />
            </Pressable>
          ) : null}
        </View>
        {followNote ? <Text accessibilityLiveRegion="polite" style={styles.note}>{followNote}</Text> : null}
        <Text style={model.bio ? screenStyles.body : screenStyles.muted}>
          {model.bio ?? (model.isOwner ? "You haven't written a bio yet." : 'No bio yet.')}
        </Text>

        {model.loadoutHref ? (
          <HubRow
            label="Loadout"
            text="Loadout"
            icon={<Crosshair size={18} color={colors.accent} />}
            onPress={() => { if (model.loadoutHref) onOpen(model.loadoutHref) }}
          />
        ) : null}
        <HubRow
          label="Lists"
          text="Lists"
          icon={<List size={18} color={colors.accent} />}
          onPress={() => onOpen(model.listsHref)}
        />
        {model.library && library ? (
          <HubRow
            label={library.label}
            text={library.text}
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
        {model.loadoutQuote ? <Text style={styles.quote}>{model.loadoutQuote}</Text> : null}

        <SectionHead>Favorite games</SectionHead>
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
          <EmptyState dense title={favoriteEmpty.title} description={favoriteEmpty.description} />
        )}

        <SectionHead>Recent reviews</SectionHead>
        <Button label="View all reviews" variant="ghost" onPress={() => onOpen(model.reviewsHref)} />
        {model.reviews.length > 0 ? model.reviews.map(review => (
          <Panel key={`${review.games.slug}-${review.created_at}`} style={styles.review}>
            <View style={styles.reviewHead}>
              <Pressable accessibilityRole="link" accessibilityLabel={review.games.name} onPress={() => onOpen(gameHref(review.games.slug))}>
                <Text style={styles.reviewGame}>{review.games.name}</Text>
              </Pressable>
              <Text style={[styles.score, { color: tierColor(review.rating) }]}>{review.rating} / 10</Text>
            </View>
            {calendarLabel(review.created_at) ? <Text style={styles.meta}>{calendarLabel(review.created_at)}</Text> : null}
            <Text style={screenStyles.body}>{review.review ? review.review : 'Scored it, no note.'}</Text>
          </Panel>
        )) : (
          <EmptyState dense title={reviewEmpty.title} description={reviewEmpty.description} />
        )}
      </ScrollView>
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
  meta: {
    fontFamily: face.mono[400],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.muted,
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  follow: { flexGrow: 1 },
  iconButton: {
    width: hitTarget,
    height: hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  note: {
    fontFamily: face.body[400],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.bad,
  },
  hubRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
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
  reviewGame: {
    fontFamily: face.display[600],
    fontSize: typeScale.base.size,
    lineHeight: typeScale.base.line,
    color: colors.text,
  },
  score: {
    fontFamily: face.mono[600],
    fontSize: typeScale.lg.size,
    lineHeight: typeScale.lg.line,
    fontVariant: ['tabular-nums'],
  },
  boneAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.surfaceLight },
  boneLine: { height: 18, width: '70%', borderRadius: radius.base, backgroundColor: colors.surfaceLight },
  boneShort: { height: 14, width: '40%', borderRadius: radius.base, backgroundColor: colors.surfaceLight },
})
