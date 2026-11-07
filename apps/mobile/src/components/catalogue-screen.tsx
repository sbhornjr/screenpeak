// Port of apps/web/app/games/page.tsx and GameFilters. The website pages with
// numbered links; the phone loads the next page near the end of the grid.
import type { GameCardData, GamesListPage } from '@screenpeak/shared/api/games'
import type { TaxonomySearchTable } from '@screenpeak/shared/api/search'
import { SlidersHorizontal } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import {
  CATALOGUE_QUERY,
  catalogueChips,
  withoutChip,
  type CatalogueQuery,
  type CatalogueSort,
} from '@/lib/catalogue-page'
import { libraryColumnWidth, orderForSort } from '@/lib/library-page'
import { gameHref } from '@/lib/routes'
import { colors, face, hitTarget, radius, space, text, tracking, trackingPx, typeScale } from '@/theme'

import { AppHeader } from './app-header'
import { Button } from './button'
import { DataAttribution } from './data-attribution'
import { EmptyState } from './empty-state'
import { FacetPicker, MenuTrigger, SortToggle, TaxonomyPicker, type TaxonomySearch } from './filter-controls'
import { GameCard } from './game-card'
import { MoreFooter } from './more-footer'
import { Sheet } from './sheet'
import { Tag } from './tag'
import { TextField } from './text-field'

const SORTS: { sort: CatalogueSort, label: string }[] = [
  { sort: 'name', label: 'Name' },
  { sort: 'ngplus_rating', label: 'ScreenPeak rating' },
]

export type CatalogueScreenProps = {
  games: GameCardData[]
  total: number
  query: CatalogueQuery
  facets: Pick<GamesListPage, 'genres' | 'platforms' | 'esrb_ratings' | 'filter_names'>
  onQuery: (query: CatalogueQuery) => void
  onOpen: (href: string) => void
  onBack: () => void
  searchTaxonomy: (table: TaxonomySearchTable, q: string) => ReturnType<TaxonomySearch>
  hasMore: boolean
  loadingMore: boolean
  loadMoreError: string | null
  onLoadMore: () => void
  refreshing: boolean
  onRefresh: () => void
  refreshError: string | null
  onRetry: () => void
  /** A new query is loading while the previous results stay on screen. */
  updating?: boolean
}

function countLabel(total: number): string {
  return total === 1 ? '1 game' : `${total.toLocaleString('en-US')} games`
}

export function CatalogueScreen({
  games,
  total,
  query,
  facets,
  onQuery,
  onOpen,
  onBack,
  searchTaxonomy,
  hasMore,
  loadingMore,
  loadMoreError,
  onLoadMore,
  refreshing,
  onRefresh,
  refreshError,
  onRetry,
  updating = false,
}: CatalogueScreenProps) {
  const { width } = useWindowDimensions()
  const compact = width <= 375
  const columnWidth = libraryColumnWidth(width)
  const [draft, setDraft] = useState(query.q ?? '')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const chips = catalogueChips(query, facets)
  const facetCount = chips.filter(chip => chip.key !== 'q').length
  const cleared = { ...CATALOGUE_QUERY, sort: query.sort, order: query.order }
  const searchDevelopers = useCallback((q: string) => searchTaxonomy('developers', q), [searchTaxonomy])
  const searchPublishers = useCallback((q: string) => searchTaxonomy('publishers', q), [searchTaxonomy])

  function search() {
    onQuery({ ...query, q: draft.trim() || null })
  }

  const header = (
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.title}>Games</Text>
      <View style={styles.controlRow}>
        <MenuTrigger
          label={`Sort: ${SORTS.find(sort => sort.sort === query.sort)?.label ?? 'Name'}`}
          onPress={() => setSortOpen(true)}
        />
        <SortToggle order={query.order} onToggle={() => onQuery({ ...query, order: query.order === 'desc' ? 'asc' : 'desc' })} />
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
        {updating ? <ActivityIndicator accessibilityLabel="Updating games" color={colors.accent} /> : null}
      </View>
      <View style={styles.controlRow}>
        <View style={styles.searchField}>
          <TextField
            label="Search games"
            hideLabel
            placeholder="Search games"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={search}
          />
        </View>
        <Button label="Search" onPress={search} />
      </View>
      {chips.length ? (
        <View style={styles.chips}>
          {chips.map(chip => (
            <Tag
              key={chip.key}
              label={chip.label}
              onRemove={() => {
                if (chip.key === 'q') setDraft('')
                onQuery(withoutChip(query, chip.key))
              }}
            />
          ))}
          <Button
            label="Clear all"
            variant="ghost"
            onPress={() => {
              setDraft('')
              onQuery(cleared)
            }}
          />
        </View>
      ) : null}
      {refreshError ? (
        <View style={styles.stack}>
          <Text accessibilityLiveRegion="polite" style={text.error}>{refreshError}</Text>
          <Button label="Retry" variant="secondary" onPress={onRetry} />
        </View>
      ) : null}
      <Text accessibilityLiveRegion="polite" style={styles.count}>{countLabel(total)}</Text>
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
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasMore && !loadingMore && !loadMoreError) onLoadMore()
        }}
        columnWrapperStyle={games.length > 0 ? styles.columns : undefined}
        contentContainerStyle={[styles.list, compact && styles.listCompact]}
        ListHeaderComponent={header}
        ListEmptyComponent={chips.length ? (
          <EmptyState
            dense
            title="No games found"
            description="Try a different search or filter."
            actionLabel="Clear filters"
            onAction={() => {
              setDraft('')
              onQuery(cleared)
            }}
          />
        ) : (
          <EmptyState dense title="No games yet." description="The catalogue is empty." />
        )}
        ListFooterComponent={(
          <View style={styles.footer}>
            <MoreFooter loadingLabel="Loading more games" loadingMore={loadingMore} loadMoreError={loadMoreError} onLoadMore={onLoadMore} />
            {!hasMore && games.length > 0 ? <DataAttribution /> : null}
          </View>
        )}
        renderItem={({ item }) => (
          <View style={[styles.cell, { width: columnWidth }]}>
            <GameCard
              game={{ id: item.id, name: item.name, slug: item.slug, cover_image_url: item.cover_image_url, released: item.released }}
              developer={item.developer}
              spRating={item.avg_rating}
              userRating={item.user_rating}
              onPress={() => onOpen(gameHref(item.slug))}
            />
          </View>
        )}
      />
      <Sheet visible={sortOpen} title="Sort" onClose={() => setSortOpen(false)}>
        {SORTS.map(sort => (
          <Button
            key={sort.sort}
            label={sort.label}
            selected={query.sort === sort.sort}
            variant="secondary"
            onPress={() => {
              onQuery({ ...query, sort: sort.sort, order: orderForSort(sort.sort) })
              setSortOpen(false)
            }}
          />
        ))}
      </Sheet>
      <Sheet visible={filtersOpen} title="Filters" onClose={() => setFiltersOpen(false)}>
        <FacetPicker label="Genre" options={facets.genres} selected={query.genre} onSelect={genre => onQuery({ ...query, genre })} />
        <FacetPicker label="Platform" options={facets.platforms} selected={query.platform} onSelect={platform => onQuery({ ...query, platform })} />
        <TaxonomyPicker
          label="Developer"
          selected={query.developer}
          selectedName={facets.filter_names.developer}
          search={searchDevelopers}
          onSelect={developer => onQuery({ ...query, developer })}
        />
        <TaxonomyPicker
          label="Publisher"
          selected={query.publisher}
          selectedName={facets.filter_names.publisher}
          search={searchPublishers}
          onSelect={publisher => onQuery({ ...query, publisher })}
        />
        <FacetPicker
          label="ESRB"
          options={facets.esrb_ratings.map(rating => ({ id: rating, name: rating, slug: rating }))}
          selected={query.esrb}
          onSelect={esrb => onQuery({ ...query, esrb })}
        />
        <Button
          label="Clear filters"
          variant="ghost"
          onPress={() => onQuery({ ...query, genre: null, platform: null, developer: null, publisher: null, esrb: null })}
        />
      </Sheet>
    </SafeAreaView>
  )
}

export function CatalogueSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <SafeAreaView accessibilityLabel="Loading games" style={styles.screen}>
      <AppHeader onBack={onBack} />
      <View style={styles.skeleton}>
        <View style={styles.boneTitle} />
        <View style={styles.boneRow} />
        <View style={styles.boneGrid}>
          <View style={styles.boneCover} />
          <View style={styles.boneCover} />
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: space[6], paddingBottom: space[10], gap: space[3] },
  listCompact: { paddingHorizontal: space[4] },
  header: { gap: space[3], paddingTop: space[4], paddingBottom: space[2] },
  title: {
    fontFamily: face.display[600],
    fontSize: typeScale['3xl'].size,
    lineHeight: typeScale['3xl'].line,
    color: colors.text,
  },
  controlRow: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: space[2] },
  searchField: { flex: 1 },
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  stack: { gap: space[2] },
  count: {
    fontFamily: face.mono[400],
    fontSize: 12,
    letterSpacing: trackingPx(tracking.wide, 12),
    textTransform: 'uppercase',
    color: colors.muted,
  },
  columns: { gap: space[3] },
  cell: { marginBottom: space[3] },
  footer: { gap: space[4] },
  skeleton: { paddingHorizontal: space[6], paddingTop: space[4], gap: space[3] },
  boneTitle: { height: 28, width: '40%', backgroundColor: colors.surfaceLight, borderRadius: radius.base },
  boneRow: { height: hitTarget, backgroundColor: colors.surfaceLight, borderRadius: radius.base },
  boneGrid: { flexDirection: 'row', gap: space[3] },
  boneCover: { flex: 1, aspectRatio: 3 / 4, backgroundColor: colors.surfaceLight, borderRadius: radius.base },
})
