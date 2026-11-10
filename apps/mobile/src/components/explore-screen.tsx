// Port of apps/web/app/explore/page.tsx. The phone adds search and genre and
// platform browse at the top and bottom, since Games is not a tab.
import type { ExploreGameCard, ExplorePageData, ExploreRange } from '@screenpeak/shared/api/explore'
import type { Taxon } from '@screenpeak/shared/api/games'
import { releaseYear } from '@screenpeak/shared/dates'
import type { GameSearchHit } from '@screenpeak/shared/api/search'
import { Image } from 'expo-image'
import { useState, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { igdbImageUri } from '@/lib/catalog-image'
import { completedLine, followedByLine, libraryLine, likedByLine } from '@/lib/explore-page'
import { catalogueHref, gameHref, profileHref } from '@/lib/routes'
import { colors, face, hitTarget, radius, space, text, tracking, trackingPx, typeScale } from '@/theme'

import { AppHeader } from './app-header'
import { Button } from './button'
import { EmptyState } from './empty-state'
import { MenuTrigger } from './filter-controls'
import { GameRail, RAIL_CARD_WIDTH, RailCard } from './game-rail'
import { ListCardView, type ListCardFields } from './list-card'
import { Panel } from './panel'
import { SectionHead } from './section-head'
import { Seal } from './seal'
import { SignupButtons } from './screen-scroll'
import { Sheet } from './sheet'
import { TextField } from './text-field'
import { UserCard } from './user-card'

type Open = (href: string) => void

const RANGES: { id: ExploreRange, label: string, phrase: string }[] = [
  { id: 'week', label: 'This week', phrase: 'this week' },
  { id: 'month', label: 'This month', phrase: 'this month' },
  { id: 'year', label: 'This year', phrase: 'this year' },
  { id: 'alltime', label: 'All time', phrase: 'yet' },
]

export type ExploreScreenProps = {
  data: ExplorePageData
  /** The range the player picked. `data.range` lags behind it while that range loads. */
  range: ExploreRange
  genres: Taxon[]
  platforms: Taxon[]
  results: GameSearchHit[] | null
  /** The search the results belong to. */
  searchedFor: string | null
  searching: boolean
  searchError: string | null
  onSearch: (query: string) => void
  onOpen: Open
  onRange: (range: ExploreRange) => void
  /** Signed in: your own lists show a like count instead of a button. */
  viewerUsername: string | null
  onLike?: (listId: string, liked: boolean) => Promise<string | null>
  /** A new range is loading while the previous one stays on screen. */
  updating?: boolean
  refreshing?: boolean
  onRefresh?: () => void
  refreshError?: string | null
  onRetry?: () => void
}

function SearchHitRow({ hit, onOpen }: { hit: GameSearchHit, onOpen: Open }) {
  const year = releaseYear(hit.released)
  const cover = igdbImageUri(hit.cover_image_url)
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={year ? `${hit.name}, ${year}` : hit.name}
      onPress={() => onOpen(gameHref(hit.slug))}
      style={styles.hitTarget}
    >
      {({ pressed }) => (
        <Panel style={[styles.hit, pressed && styles.hitPressed]}>
          <View style={styles.hitCover}>
            {cover ? <Image source={cover} recyclingKey={hit.id} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
          </View>
          <View style={styles.hitBody}>
            <Text numberOfLines={2} style={styles.hitName}>{hit.name}</Text>
            <Text style={styles.meta}>{[year, hit.avg_rating != null ? `SP ${hit.avg_rating}/10` : null].filter(Boolean).join(' · ')}</Text>
          </View>
        </Panel>
      )}
    </Pressable>
  )
}

function RecommendedGame({ game, onOpen }: { game: ExploreGameCard, onOpen: Open }) {
  const where = libraryLine(game.library_status)
  return (
    <RailCard
      game={game}
      onOpen={onOpen}
      above={<Text numberOfLines={2} style={styles.caption}>{completedLine(game.follower_count ?? 0, game.avg_follower_rating ?? null)}</Text>}
      below={where ? <Text style={styles.caption}>{where}</Text> : null}
    />
  )
}

/** The #1 trending game, as a lead banner above the rest of the rail. */
function FeaturedTrendingCard({ game, onOpen }: { game: ExploreGameCard, onOpen: Open }) {
  const year = releaseYear(game.released)
  const cover = igdbImageUri(game.cover_image_url)
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={game.name} onPress={() => onOpen(gameHref(game.slug))} style={styles.featuredTarget}>
      {({ pressed }) => (
        <View style={[styles.featured, pressed && styles.featuredPressed]}>
          <View style={styles.featuredCover}>
            {cover ? <Image source={cover} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
            {game.avg_rating != null ? <Seal label="SP" score={game.avg_rating} side="right" /> : null}
          </View>
          <View style={styles.featuredBody}>
            <Text style={styles.featuredEyebrow}>Trending now</Text>
            <Text numberOfLines={2} style={styles.featuredName}>{game.name}</Text>
            <Text numberOfLines={1} style={styles.meta}>{[year, game.developer].filter(Boolean).join(' · ')}</Text>
          </View>
        </View>
      )}
    </Pressable>
  )
}

/** A one-line, horizontally-scrolling chip row — never wraps, whatever the screen width. */
function Chips({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipsScroll}
      contentContainerStyle={styles.chips}
    >
      {children}
    </ScrollView>
  )
}

/** A dropdown, like the Library tab's: the trigger opens a sheet of options you can narrow by typing. */
function BrowseMenu({ label, noun, options, onPick }: {
  label: string
  noun: string
  options: Taxon[]
  onPick: (slug: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [needle, setNeedle] = useState('')
  const typed = needle.trim().toLowerCase()
  const shown = typed ? options.filter(option => option.name.toLowerCase().includes(typed)) : options
  function close() {
    setOpen(false)
    setNeedle('')
  }
  return (
    <>
      {/* The trigger grows along a row, as on the Library tab, so it gets one here too. */}
      <View style={styles.menuRow}>
        <MenuTrigger label={label} onPress={() => setOpen(true)} />
      </View>
      <Sheet visible={open} title={label} onClose={close}>
        <TextField label={`Search ${noun}`} hideLabel placeholder={`Search ${noun}`} value={needle} onChangeText={setNeedle} />
        {shown.length === 0 ? <Text style={text.muted}>No matches</Text> : shown.map(option => (
          <Button
            key={option.id}
            label={option.name}
            accessibilityLabel={`Browse ${option.name}`}
            variant="secondary"
            onPress={() => {
              close()
              onPick(option.slug)
            }}
          />
        ))}
      </Sheet>
    </>
  )
}

export function ExploreScreen({
  data,
  range,
  genres,
  platforms,
  results,
  searchedFor,
  searching,
  searchError,
  onSearch,
  onOpen,
  onRange,
  viewerUsername,
  onLike,
  updating = false,
  refreshing = false,
  onRefresh,
  refreshError = null,
  onRetry,
}: ExploreScreenProps) {
  const { width } = useWindowDimensions()
  const compact = width <= 375
  const inset = compact ? space[4] : space[6]
  const [query, setQuery] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const phrase = RANGES.find(item => item.id === data.range)?.phrase ?? 'this week'
  const recommendations = data.recommendations
  const nothingRecommended = recommendations != null
    && recommendations.games.length === 0
    && recommendations.lists.length === 0
    && recommendations.users.length === 0
  // Signed in with nothing trending, recommended, or peaking: one quiet message
  // beats three stacked empty-state blocks in a row.
  const allQuiet = recommendations != null
    && nothingRecommended
    && data.trending_games.length === 0
    && data.trending_lists.length === 0

  function submit() {
    const trimmed = query.trim()
    if (!trimmed) {
      setHint('Type a game name.')
      return
    }
    setHint(null)
    onSearch(trimmed)
  }

  function listCard(list: ListCardFields) {
    return (
      <ListCardView
        list={list}
        username={list.owner_username}
        canLike={viewerUsername != null && onLike != null && list.owner_username !== viewerUsername}
        canPin={false}
        onOpen={onOpen}
        onLike={onLike}
        onActionError={setActionError}
      />
    )
  }

  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader />
      <ScrollView
        contentContainerStyle={[styles.content, compact && styles.contentCompact]}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} /> : undefined}
      >
        <Text role="heading" accessibilityRole="header" accessibilityLevel={1} style={styles.title}>Explore</Text>
        {refreshError ? (
          <View style={styles.stack}>
            <Text accessibilityLiveRegion="polite" style={text.error}>{refreshError}</Text>
            {onRetry ? <Button label="Retry" variant="secondary" onPress={onRetry} /> : null}
          </View>
        ) : null}

        <View style={styles.searchRow}>
          <View style={styles.searchField}>
            <TextField
              label="Search games"
              hideLabel
              placeholder="Search games"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={submit}
            />
          </View>
          <Button label="Search" onPress={submit} />
        </View>
        <Button
          label="Browse all"
          accessibilityLabel={searchedFor ? `Browse all games matching "${searchedFor}"` : 'Browse all'}
          variant="secondary"
          onPress={() => onOpen(catalogueHref(searchedFor ? { q: searchedFor } : {}))}
        />
        {hint ? <Text style={text.muted}>{hint}</Text> : null}
        {searching ? <ActivityIndicator accessibilityLabel="Searching games" color={colors.accent} /> : null}
        {searchError ? <Text accessibilityLiveRegion="polite" style={text.error}>{searchError}</Text> : null}
        {results && searchedFor ? (
          <View style={styles.stack}>
            {results.length === 0
              ? <Text style={text.muted}>{`No games match "${searchedFor}".`}</Text>
              : results.map(hit => <SearchHitRow key={hit.id} hit={hit} onOpen={onOpen} />)}
          </View>
        ) : null}

        <View style={styles.rangeRow}>
          <Chips>
            {RANGES.map(item => (
              <Button
                key={item.id}
                label={item.label}
                variant={range === item.id ? 'primary' : 'ghost'}
                selected={range === item.id}
                onPress={() => onRange(item.id)}
                style={styles.rangeChip}
              />
            ))}
          </Chips>
          {updating ? <ActivityIndicator accessibilityLabel="Updating Explore" color={colors.accent} /> : null}
        </View>
        {actionError ? <Text accessibilityLiveRegion="polite" style={text.error}>{actionError}</Text> : null}

        {allQuiet ? (
          <EmptyState
            dense
            title="It's quiet out there."
            description="Follow more players to see what's trending, recommended, and peaking."
          />
        ) : (
          <>
            <SectionHead>Peak right now</SectionHead>
            {data.trending_games.length === 0 ? (
              <EmptyState dense title={`Nothing peaking ${phrase}.`} />
            ) : (
              <View style={styles.stack}>
                <FeaturedTrendingCard game={data.trending_games[0]} onOpen={onOpen} />
                {data.trending_games.length > 1 ? (
                  <GameRail label="Peak right now" inset={inset}>
                    {data.trending_games.slice(1).map(game => (
                      <RailCard key={game.id} game={game} onOpen={onOpen} />
                    ))}
                  </GameRail>
                ) : null}
              </View>
            )}

            <SectionHead>Recommended for you</SectionHead>
            {recommendations == null ? (
              <View style={styles.stack}>
                <Text style={text.muted}>Sign up to see what people you follow are playing.</Text>
                <SignupButtons onOpen={onOpen} />
              </View>
            ) : (
              <View style={styles.stack}>
                <Text style={text.muted}>Follow more users to get more recommendations.</Text>
                {nothingRecommended ? <EmptyState dense title="No recommendations yet." /> : null}
                {recommendations.games.length > 0 ? (
                  <>
                    <Text accessibilityRole="header" style={styles.subhead}>Games</Text>
                    <GameRail label="Recommended games" inset={inset}>
                      {recommendations.games.map(game => <RecommendedGame key={game.id} game={game} onOpen={onOpen} />)}
                    </GameRail>
                  </>
                ) : null}
                {recommendations.lists.length > 0 ? (
                  <>
                    <Text accessibilityRole="header" style={styles.subhead}>Lists</Text>
                    {recommendations.lists.map(list => (
                      <View key={list.id} style={styles.captioned}>
                        <Text style={styles.caption}>{likedByLine(list.follower_like_count ?? 0)}</Text>
                        {listCard(list)}
                      </View>
                    ))}
                  </>
                ) : null}
                {recommendations.users.length > 0 ? (
                  <>
                    <Text accessibilityRole="header" style={styles.subhead}>Players</Text>
                    {recommendations.users.map(user => (
                      <View key={user.id} style={styles.captioned}>
                        <Text style={styles.caption}>{followedByLine(user.mutual_follower_count)}</Text>
                        <UserCard user={user} onPress={() => onOpen(profileHref(user.username))} />
                      </View>
                    ))}
                  </>
                ) : null}
              </View>
            )}

            <SectionHead>Lists peaking now</SectionHead>
            {data.trending_lists.length === 0 ? (
              <EmptyState dense title={`No lists peaking ${phrase}.`} />
            ) : (
              <View>
                {data.trending_lists.map(list => <View key={list.id}>{listCard(list)}</View>)}
              </View>
            )}
          </>
        )}

        <SectionHead>Browse</SectionHead>
        {genres.length > 0 ? (
          <BrowseMenu label="Browse by genre" noun="genres" options={genres} onPick={genre => onOpen(catalogueHref({ genre }))} />
        ) : null}
        {platforms.length > 0 ? (
          <BrowseMenu label="Browse by platform" noun="platforms" options={platforms} onPick={platform => onOpen(catalogueHref({ platform }))} />
        ) : null}
        <Button label="Browse all" onPress={() => onOpen(catalogueHref())} />
      </ScrollView>
    </SafeAreaView>
  )
}

export function ExploreSkeleton() {
  return (
    <SafeAreaView accessibilityLabel="Loading Explore" style={styles.screen}>
      <AppHeader />
      <View style={styles.content}>
        <View style={styles.boneTitle} />
        <View style={styles.boneRow} />
        <View style={styles.boneRail}>
          <View style={styles.boneCover} />
          <View style={styles.boneCover} />
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[6], paddingTop: space[4], paddingBottom: space[10], gap: space[4] },
  contentCompact: { paddingHorizontal: space[4] },
  title: {
    fontFamily: face.display[600],
    fontSize: typeScale['3xl'].size,
    lineHeight: typeScale['3xl'].line,
    color: colors.text,
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  searchField: { flex: 1 },
  stack: { gap: space[3] },
  hitTarget: { minHeight: hitTarget },
  hit: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[2] },
  hitPressed: { borderColor: colors.accent },
  hitCover: { width: 42, aspectRatio: 3 / 4, borderRadius: radius.base, overflow: 'hidden', backgroundColor: colors.surfaceLight },
  hitBody: { flex: 1, minWidth: 0, gap: space[0.5] },
  hitName: { fontFamily: face.display[500], fontSize: typeScale.base.size, lineHeight: typeScale.base.line, color: colors.text },
  meta: { fontFamily: face.mono[400], fontSize: 12, lineHeight: 16, color: colors.muted },
  featuredTarget: { minHeight: hitTarget },
  featured: {
    flexDirection: 'row',
    gap: space[3],
    padding: space[3],
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  featuredPressed: { borderColor: colors.accent },
  featuredCover: {
    width: 110,
    aspectRatio: 3 / 4,
    borderRadius: radius.base,
    overflow: 'hidden',
    backgroundColor: colors.surfaceLight,
  },
  featuredBody: { flex: 1, minWidth: 0, justifyContent: 'center', gap: space[1] },
  featuredEyebrow: {
    fontFamily: face.mono[600],
    fontSize: typeScale.eyebrow.size,
    letterSpacing: trackingPx(tracking.wide, typeScale.eyebrow.size),
    textTransform: 'uppercase',
    color: colors.accent,
  },
  featuredName: {
    fontFamily: face.display[600],
    fontSize: typeScale.lg.size,
    lineHeight: typeScale.lg.line,
    color: colors.text,
  },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  rangeChip: { paddingHorizontal: space[2], minWidth: 0 },
  chipsScroll: { flexShrink: 1 },
  chips: { flexDirection: 'row', gap: space[1.5] },
  menuRow: { flexDirection: 'row' },
  caption: { fontFamily: face.body[400], fontSize: typeScale.xs.size, lineHeight: typeScale.xs.line, color: colors.muted },
  captioned: { gap: space[1.5] },
  subhead: {
    fontFamily: face.display[600],
    fontSize: typeScale.lg.size,
    lineHeight: typeScale.lg.line,
    color: colors.text,
  },
  boneTitle: { height: 28, width: '40%', backgroundColor: colors.surfaceLight, borderRadius: radius.base },
  boneRow: { height: hitTarget, backgroundColor: colors.surfaceLight, borderRadius: radius.base },
  boneRail: { flexDirection: 'row', gap: space[3] },
  boneCover: { width: RAIL_CARD_WIDTH, aspectRatio: 3 / 4, backgroundColor: colors.surfaceLight, borderRadius: radius.base },
})
