import type { LibraryGameCard, LibraryPageData, LibraryQuery, LibrarySort } from '@screenpeak/shared/api/library'
import type { LibraryWrite } from '@screenpeak/shared/api/writes'
import { Pencil, SlidersHorizontal } from 'lucide-react-native'
import { useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { cardEntry, EMPTY_FACETS, LIBRARY_QUERY, libraryColumnWidth, libraryFiltersActive, libraryRowLayout, orderForSort } from '@/lib/library-page'
import { gameHref } from '@/lib/routes'
import { colors, face, hitTarget, radius, space, text, typeScale } from '@/theme'

import { AppHeader } from './app-header'
import { Button } from './button'
import { EmptyState } from './empty-state'
import { FacetPicker, MenuTrigger, SortToggle } from './filter-controls'
import { GameCard } from './game-card'
import { LibrarySheet } from './library-sheet'
import { LibraryStatRow } from './library-stat-row'
import { Sheet } from './sheet'
import { SignupButtons } from './screen-scroll'
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
  loadError?: string | null
  onRetry?: () => void
}

function LibraryCell({
  game,
  canEdit,
  width,
  onOpen,
  onEdit,
}: {
  game: LibraryGameCard
  canEdit: boolean
  width: number
  onOpen: (href: string) => void
  onEdit: () => void
}) {
  const coverBottom = 1 + (width - 2) * (4 / 3)
  return (
    <View style={[styles.cell, { width }]}>
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
      {canEdit ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${game.name}`}
          onPress={onEdit}
          style={[styles.edit, { top: coverBottom - hitTarget - space[2] }]}
        >
          <Pencil size={18} color={colors.accent} />
        </Pressable>
      ) : null}
      <LibraryStatRow entry={game} />
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
  loadError = null,
  onRetry,
}: LibraryScreenProps) {
  const { width } = useWindowDimensions()
  const compact = width <= 375
  const columnWidth = libraryColumnWidth(width)
  const [draft, setDraft] = useState(query.q ?? '')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [menu, setMenu] = useState<null | 'status' | 'sort'>(null)
  const [headerHeight, setHeaderHeight] = useState(0)
  const [editing, setEditing] = useState<LibraryGameCard | null>(null)
  const filteredEmpty = libraryFiltersActive(query)
  const facetCount = [query.genre, query.platform, query.developer, query.publisher, query.esrb].filter(Boolean).length

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
    <View
      style={styles.header}
      onLayout={(event) => {
        const next = event.nativeEvent.layout.height
        setHeaderHeight(current => current === next ? current : next)
      }}
    >
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <View style={styles.controlRow}>
        <MenuTrigger
          label={`Status: ${STATUS_TABS.find(tab => tab.status === query.status)?.label ?? 'All'}`}
          onPress={() => setMenu('status')}
        />
        <Button
          label="100% only"
          selected={query.is100}
          variant="secondary"
          onPress={() => change({ ...query, is100: !query.is100 })}
          style={styles.sideControl}
        />
      </View>
      <View style={styles.controlRow}>
        <MenuTrigger
          label={`Sort: ${SORTS.find(sort => sort.sort === query.sort)?.label ?? 'Name'}`}
          onPress={() => setMenu('sort')}
        />
        <SortToggle order={query.order} onToggle={() => change({ ...query, order: query.order === 'desc' ? 'asc' : 'desc' })} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={facetCount ? `Filters, ${facetCount} on` : 'Filters'}
          onPress={() => setFiltersOpen(true)}
          style={[styles.filterButton, facetCount > 0 && styles.filterButtonActive]}
        >
          <SlidersHorizontal size={18} color={facetCount > 0 ? colors.accent : colors.muted} />
          {facetCount > 0 ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{facetCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      {loadError ? (
        <View style={styles.stack}>
          <Text accessibilityLiveRegion="polite" style={text.error}>{loadError}</Text>
          {onRetry ? <Button label="Retry" variant="secondary" onPress={onRetry} /> : null}
        </View>
      ) : null}
      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <TextField
            label="Search games"
            hideLabel
            placeholder="Search games"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => change({ ...query, q: draft.trim() || null })}
          />
        </View>
        <Button label="Search" onPress={() => change({ ...query, q: draft.trim() || null })} />
      </View>
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
        getItemLayout={(_data, index) => libraryRowLayout(columnWidth, headerHeight, index)}
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
            width={columnWidth}
            onOpen={onOpen}
            onEdit={() => setEditing(item)}
          />
        )}
      />
      <Sheet visible={filtersOpen} title="Filters" onClose={() => setFiltersOpen(false)}>
        <FacetPicker label="Genres" options={facets.genres} selected={query.genre} onSelect={genre => change({ ...query, genre })} />
        <FacetPicker label="Platforms" options={facets.platforms} selected={query.platform} onSelect={platform => change({ ...query, platform })} />
        <FacetPicker label="Developers" options={facets.developers} selected={query.developer} onSelect={developer => change({ ...query, developer })} />
        <FacetPicker label="Publishers" options={facets.publishers} selected={query.publisher} onSelect={publisher => change({ ...query, publisher })} />
        <FacetPicker
          label="ESRB"
          options={facets.esrb_ratings.map(rating => ({ id: rating, name: rating, slug: rating }))}
          selected={query.esrb}
          onSelect={esrb => change({ ...query, esrb })}
        />
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
      <Sheet
        visible={menu != null}
        title={menu === 'sort' ? 'Sort' : 'Status'}
        onClose={() => setMenu(null)}
      >
        {menu === 'sort' ? SORTS.map(sort => (
          <Button
            key={sort.sort}
            label={sort.label}
            selected={query.sort === sort.sort}
            variant="secondary"
            onPress={() => {
              change({ ...query, sort: sort.sort, order: orderForSort(sort.sort) })
              setMenu(null)
            }}
          />
        )) : null}
        {menu === 'status' ? STATUS_TABS.map(tab => (
          <Button
            key={tab.label}
            label={tab.label}
            selected={query.status === tab.status}
            variant="secondary"
            onPress={() => {
              change({ ...query, status: tab.status })
              setMenu(null)
            }}
          />
        )) : null}
      </Sheet>
      <LibrarySheet
        visible={editing != null}
        entry={editing ? cardEntry(editing) : null}
        onClose={() => setEditing(null)}
        onSave={editing && onSave ? (write) => onSave(editing.id, write) : undefined}
        onRemove={editing && onRemove ? () => onRemove(editing.id) : undefined}
      />
    </SafeAreaView>
  )
}

export function LibrarySkeleton() {
  return (
    <SafeAreaView accessibilityLabel="Loading library" style={styles.screen}>
      <AppHeader />
      <View style={styles.pad}>
        <View style={styles.bone} />
        <View style={styles.boneShort} />
      </View>
    </SafeAreaView>
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
  controlRow: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: space[2] },
  sideControl: { flexShrink: 0, paddingHorizontal: space[3] },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  searchField: { flex: 1 },
  columns: { gap: space[3] },
  cell: { position: 'relative', gap: space[2], marginBottom: space[3] },
  edit: {
    position: 'absolute',
    right: space[2],
    zIndex: 2,
    width: hitTarget,
    height: hitTarget,
    minWidth: hitTarget,
    minHeight: hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterButton: {
    minHeight: hitTarget,
    minWidth: hitTarget,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterButtonActive: { borderColor: colors.accent },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: { fontFamily: face.mono[600], fontSize: 10, color: colors.bg },
  stack: { gap: space[2] },
  bone: { height: 28, width: '55%', backgroundColor: colors.surfaceLight, borderRadius: radius.base },
  boneShort: { height: 160, backgroundColor: colors.surfaceLight, borderRadius: radius.base },
})
