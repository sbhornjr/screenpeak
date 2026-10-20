import type { LibraryGameCard, LibraryPageData, LibraryQuery, LibrarySort } from '@screenpeak/shared/api/library'
import type { LibraryWrite } from '@screenpeak/shared/api/writes'
import { libraryStats } from '@screenpeak/shared/library-copy'
import { Clock, Pencil, Repeat, SlidersHorizontal, Trophy } from 'lucide-react-native'
import { useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { cardEntry, EMPTY_FACETS, LIBRARY_QUERY, libraryFiltersActive, orderForSort } from '@/lib/library-page'
import { gameHref } from '@/lib/routes'
import { colors, face, hitTarget, radius, space, typeScale } from '@/theme'

import { AppHeader } from './app-header'
import { Button } from './button'
import { EmptyState } from './empty-state'
import { GameCard } from './game-card'
import { LibrarySheet } from './library-sheet'
import { Sheet } from './sheet'
import { SignupButtons, screenStyles } from './screen-scroll'
import { TextField } from './text-field'

const STATUS_TABS: { status: LibraryQuery['status'], label: string }[] = [
  { status: '', label: 'All' },
  { status: 'completed', label: 'Completed' },
  { status: 'playing', label: 'Playing' },
  { status: 'backlog', label: 'Backlog' },
  { status: 'abandoned', label: 'Abandoned' },
]

const SORTS: { sort: LibrarySort, label: string }[] = [
  { sort: 'date_added', label: 'Date added' },
  { sort: 'name', label: 'Name' },
  { sort: 'ngplus_rating', label: 'ScreenPeak rating' },
  { sort: 'your_rating', label: 'Your rating' },
]

const STAT_ICON = { hours: Clock, plays: Repeat, complete: Trophy }

type CardStatus = 'playing' | 'completed' | 'backlog' | 'abandoned'

function cardStatus(status: string | null): CardStatus | null {
  if (status === 'playing' || status === 'completed' || status === 'backlog' || status === 'abandoned') return status
  return null
}

export type LibraryScreenProps = {
  locked?: boolean
  access?: 'ready' | 'private'
  games?: LibraryGameCard[]
  facets?: LibraryPageData['facets']
  query?: LibraryQuery
  canEdit?: boolean
  title?: string
  onOpen: (href: string) => void
  onQuery?: (query: LibraryQuery) => void
  onSave?: (gameId: string, write: LibraryWrite) => Promise<string | null>
  onRemove?: (gameId: string) => Promise<string | null>
  onBack?: () => void
  refreshing?: boolean
  onRefresh?: () => void
}

function LibraryCell({
  game,
  canEdit,
  onOpen,
  onEdit,
}: {
  game: LibraryGameCard
  canEdit: boolean
  onOpen: (href: string) => void
  onEdit: () => void
}) {
  const stats = libraryStats({
    hours_played: game.hours_played,
    play_count: game.play_count,
    completed_all_achievements: game.completed_all_achievements,
  })
  return (
    <View style={styles.cell}>
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
        libraryStatus={cardStatus(game.library_status)}
        onPress={() => onOpen(gameHref(game.slug))}
      />
      <View style={styles.statRow}>
        {stats.map(stat => {
          const Icon = STAT_ICON[stat.key]
          return (
            <View key={stat.key} style={styles.statItem}>
              <Icon size={16} color={colors.muted} accessibilityLabel={stat.label} />
              <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.statValue}>{stat.value}</Text>
            </View>
          )
        })}
      </View>
      {canEdit ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${game.name}`}
          onPress={onEdit}
          style={styles.edit}
        >
          <Pencil size={18} color={colors.accent} />
        </Pressable>
      ) : null}
    </View>
  )
}

function FacetGroup({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string
  options: { id: string, name: string, slug: string }[]
  selected: string | null
  onSelect: (slug: string | null) => void
}) {
  if (options.length === 0) return null
  return (
    <View style={styles.stack}>
      <Text style={styles.metaLabel}>{label}</Text>
      <View style={styles.wrap}>
        <Button label={`All ${label.toLowerCase()}`} selected={!selected} variant="secondary" onPress={() => onSelect(null)} />
        {options.map(option => (
          <Button
            key={option.id}
            label={option.name}
            selected={selected === option.slug}
            variant="secondary"
            onPress={() => onSelect(option.slug)}
          />
        ))}
      </View>
    </View>
  )
}

/** Cover grid of one library. The owner edits a game through the library sheet. */
export function LibraryScreen({
  locked = false,
  access = 'ready',
  games = [],
  facets = EMPTY_FACETS,
  query = LIBRARY_QUERY,
  canEdit = false,
  title = 'Library',
  onOpen,
  onQuery,
  onSave,
  onRemove,
  onBack,
  refreshing = false,
  onRefresh,
}: LibraryScreenProps) {
  const { width } = useWindowDimensions()
  const compact = width <= 375
  const [draft, setDraft] = useState(query.q ?? '')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = games.find(game => game.id === editingId) ?? null
  const filteredEmpty = libraryFiltersActive(query)

  function change(next: LibraryQuery) {
    onQuery?.(next)
  }

  if (locked) {
    return (
      <SafeAreaView style={styles.screen}>
        <AppHeader />
        <View style={[styles.pad, compact && styles.padCompact]}>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <EmptyState dense title="Sign up to see your library." />
          <SignupButtons onOpen={onOpen} />
        </View>
      </SafeAreaView>
    )
  }

  if (access === 'private') {
    return (
      <SafeAreaView style={styles.screen}>
        <AppHeader onBack={onBack} />
        <View style={[styles.pad, compact && styles.padCompact]}>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <EmptyState
            dense
            title="This library is private."
            description="Only this player can see these games."
          />
        </View>
      </SafeAreaView>
    )
  }

  const header = (
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <View style={styles.wrap}>
        {STATUS_TABS.map(tab => (
          <Button
            key={tab.label}
            label={tab.label}
            selected={query.status === tab.status}
            variant="secondary"
            onPress={() => change({ ...query, status: tab.status })}
          />
        ))}
        <Button
          label="100% only"
          selected={query.is100}
          variant="secondary"
          onPress={() => change({ ...query, is100: !query.is100 })}
        />
      </View>
      <View style={styles.wrap}>
        {SORTS.map(sort => (
          <Button
            key={sort.sort}
            label={sort.label}
            selected={query.sort === sort.sort}
            variant="secondary"
            onPress={() => change({ ...query, sort: sort.sort, order: orderForSort(sort.sort) })}
          />
        ))}
      </View>
      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <TextField
            label="Search games"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => change({ ...query, q: draft.trim() || null })}
          />
        </View>
        <Button label="Search" onPress={() => change({ ...query, q: draft.trim() || null })} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Filters"
        onPress={() => setFiltersOpen(true)}
        style={styles.filterButton}
      >
        <SlidersHorizontal size={18} color={colors.accent} />
        <Text style={screenStyles.body}>Filters</Text>
      </Pressable>
    </View>
  )

  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader onBack={onBack} />
      <FlatList
        data={games}
        keyExtractor={game => game.id}
        numColumns={2}
        refreshing={refreshing}
        onRefresh={onRefresh}
        columnWrapperStyle={games.length > 0 ? styles.columns : undefined}
        contentContainerStyle={[styles.list, compact && styles.padCompact]}
        ListHeaderComponent={header}
        ListEmptyComponent={(
          <EmptyState
            dense
            title={filteredEmpty ? 'No games found' : 'Nothing in this library yet.'}
            description={filteredEmpty ? 'Try a different search or filter.' : 'Games you log show up here.'}
          />
        )}
        renderItem={({ item }) => (
          <LibraryCell
            game={item}
            canEdit={canEdit}
            onOpen={onOpen}
            onEdit={() => setEditingId(item.id)}
          />
        )}
      />
      <Sheet visible={filtersOpen} title="Filters" onClose={() => setFiltersOpen(false)}>
        <FacetGroup
          label="Genres"
          options={facets.genres}
          selected={query.genre}
          onSelect={genre => change({ ...query, genre })}
        />
        <FacetGroup
          label="Platforms"
          options={facets.platforms}
          selected={query.platform}
          onSelect={platform => change({ ...query, platform })}
        />
        <FacetGroup
          label="Developers"
          options={facets.developers}
          selected={query.developer}
          onSelect={developer => change({ ...query, developer })}
        />
        <FacetGroup
          label="Publishers"
          options={facets.publishers}
          selected={query.publisher}
          onSelect={publisher => change({ ...query, publisher })}
        />
        {facets.esrb_ratings.length > 0 ? (
          <View style={styles.stack}>
            <Text style={styles.metaLabel}>ESRB</Text>
            <View style={styles.wrap}>
              <Button label="All ESRB ratings" selected={!query.esrb} variant="secondary" onPress={() => change({ ...query, esrb: null })} />
              {facets.esrb_ratings.map(rating => (
                <Button
                  key={rating}
                  label={rating}
                  selected={query.esrb === rating}
                  variant="secondary"
                  onPress={() => change({ ...query, esrb: rating })}
                />
              ))}
            </View>
          </View>
        ) : null}
        <Button
          label="Clear filters"
          variant="ghost"
          onPress={() => change({
            ...query,
            genre: null,
            platform: null,
            developer: null,
            publisher: null,
            esrb: null,
          })}
        />
      </Sheet>
      <LibrarySheet
        visible={editing != null}
        entry={editing ? cardEntry(editing) : null}
        onClose={() => setEditingId(null)}
        onSave={editing && onSave ? (write) => onSave(editing.id, write) : undefined}
        onRemove={editing && onRemove ? () => onRemove(editing.id) : undefined}
      />
    </SafeAreaView>
  )
}

export function LibrarySkeleton() {
  return (
    <View accessibilityLabel="Loading library" style={styles.screen}>
      <AppHeader />
      <View style={styles.pad}>
        <View style={styles.bone} />
        <View style={styles.boneShort} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: space[6], paddingTop: space[4], gap: space[3] },
  padCompact: { paddingHorizontal: space[4] },
  list: { paddingHorizontal: space[6], paddingBottom: space[10], gap: space[3] },
  header: { gap: space[3], paddingTop: space[4], paddingBottom: space[2] },
  title: {
    fontFamily: face.display[600],
    fontSize: typeScale['3xl'].size,
    lineHeight: typeScale['3xl'].line,
    color: colors.text,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], alignItems: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space[2] },
  searchField: { flex: 1 },
  columns: { gap: space[3] },
  cell: { flex: 1, gap: space[2], marginBottom: space[3] },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[3] },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  statValue: { fontFamily: face.mono[400], fontSize: typeScale.sm.size, color: colors.text },
  edit: {
    minWidth: hitTarget,
    minHeight: hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  filterButton: {
    minHeight: hitTarget,
    minWidth: hitTarget,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space[2],
    paddingHorizontal: space[3],
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stack: { gap: space[2] },
  metaLabel: {
    fontFamily: face.mono[400],
    fontSize: typeScale.eyebrow.size,
    color: colors.muted,
  },
  bone: { height: 28, width: '55%', backgroundColor: colors.surfaceLight, borderRadius: radius.base },
  boneShort: { height: 160, backgroundColor: colors.surfaceLight, borderRadius: radius.base },
})
