import type { GameCardData } from '@screenpeak/shared/api/games'
import type { GameSearchHit } from '@screenpeak/shared/api/search'
import type { ListGameSync, ListWrite } from '@screenpeak/shared/api/writes'
import { Heart, X } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { actionFailure } from '@/lib/game-page'
import { libraryColumnWidth } from '@/lib/library-page'
import { gamesLabel, likeLabel } from '@/lib/lists-page'
import { gameHref, profileHref } from '@/lib/routes'
import { colors, face, hitTarget, radius, space, typeScale } from '@/theme'

import { AppHeader } from './app-header'
import { Avatar } from './avatar'
import { Button } from './button'
import { EmptyState } from './empty-state'
import { GameCard } from './game-card'
import { ListFormSheet, type ListFormValues } from './list-form-sheet'
import { Sheet, useSheetDismiss } from './sheet'
import { TextField } from './text-field'

export type ListDetailScreenProps = {
  name: string
  description?: string
  username?: string
  avatarUrl?: string | null
  gameCount?: number
  updatedLabel?: string
  likeCount?: number
  liked?: boolean
  canEdit?: boolean
  canDelete?: boolean
  isPublic?: boolean
  isPinned?: boolean
  signedIn?: boolean
  games?: GameCardData[]
  refreshing?: boolean
  loadError?: string | null
  onOpen: (href: string) => void
  onBack?: () => void
  onLike?: (liked: boolean) => Promise<string | null>
  onEdit?: (input: ListWrite) => Promise<string | null>
  onDelete?: () => Promise<string | null>
  onSearch?: (query: string) => Promise<GameSearchHit[]>
  onSaveGames?: (sync: ListGameSync, added: GameSearchHit[]) => Promise<string | null>
  onRemoveGame?: (gameId: string) => Promise<string | null>
  onRefresh?: () => void
  onRetry?: () => void
}

function AccountActions({ onOpen }: { onOpen: (href: string) => void }) {
  const dismiss = useSheetDismiss()
  return (
    <>
      <Text style={styles.body}>Sign up to like a list, or to make your own.</Text>
      <Button label="Sign up" onPress={() => dismiss(() => onOpen('/sign-up'))} />
      <Button label="Log in" variant="secondary" onPress={() => dismiss(() => onOpen('/sign-in'))} />
    </>
  )
}

function ListGameCell({
  game,
  canEdit,
  width,
  onOpen,
  onRemove,
}: {
  game: GameCardData
  canEdit: boolean
  width: number
  onOpen: (href: string) => void
  onRemove: () => void
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
        onPress={() => onOpen(gameHref(game.slug))}
      />
      {canEdit ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${game.name}`}
          onPress={onRemove}
          style={[styles.remove, { top: coverBottom - hitTarget - space[2] }]}
        >
          <X size={18} color={colors.accent} />
        </Pressable>
      ) : null}
    </View>
  )
}

/** One list: the title, the owner, and a cover grid. The owner edits from a sheet. */
export function ListDetailScreen({
  name,
  description = '',
  username = '',
  avatarUrl = null,
  gameCount,
  updatedLabel = '',
  likeCount = 0,
  liked = false,
  canEdit = false,
  canDelete = false,
  isPublic = true,
  isPinned = false,
  signedIn = false,
  games = [],
  refreshing = false,
  loadError = null,
  onOpen,
  onBack,
  onLike,
  onEdit,
  onDelete,
  onSearch,
  onSaveGames,
  onRemoveGame,
  onRefresh,
  onRetry,
}: ListDetailScreenProps) {
  const { width } = useWindowDimensions()
  const compact = width <= 375
  const columnWidth = libraryColumnWidth(width)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<GameCardData | null>(null)
  const [account, setAccount] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const count = gameCount ?? games.length

  async function saveEdit(values: ListFormValues) {
    if (!onEdit) return
    setBusy(true)
    setError(null)
    const next = await onEdit(values)
    setBusy(false)
    if (next) {
      setError(next)
      return
    }
    setEditing(false)
  }

  async function confirmDelete() {
    if (!onDelete) return
    setBusy(true)
    setError(null)
    const next = await onDelete()
    setBusy(false)
    if (next) setError(next)
  }

  async function confirmRemove() {
    if (!removing || !onRemoveGame) return
    setBusy(true)
    setActionError(null)
    const next = await onRemoveGame(removing.id)
    setBusy(false)
    if (next) {
      setActionError(next)
      return
    }
    setRemoving(null)
  }

  const header = (
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.title}>{name}</Text>
      {username ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={username}
          onPress={() => onOpen(profileHref(username))}
          style={styles.ownerRow}
        >
          <Avatar src={avatarUrl} alt={username} size="sm" />
          <Text style={styles.owner}>{username}</Text>
        </Pressable>
      ) : null}
      <Text style={styles.meta}>
        {gamesLabel(count)}
        {canEdit && !isPublic ? ' · Private' : ''}
        {updatedLabel ? ` · ${updatedLabel}` : ''}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={liked ? `Unlike ${name}` : `Like ${name}`}
        onPress={() => {
          if (!signedIn) {
            setAccount(true)
            return
          }
          void onLike?.(!liked)?.then(message => setActionError(message))
        }}
        style={styles.action}
      >
        <Heart size={16} color={liked ? colors.accent : colors.muted} />
        <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.actionText}>
          {likeLabel(liked, likeCount)}
        </Text>
      </Pressable>
      {description ? <Text style={styles.body}>{description}</Text> : null}
      {canEdit ? (
        <View style={styles.ownerActions}>
          <Button label="Edit" variant="ghost" accessibilityLabel="Edit list" onPress={() => { setError(null); setEditing(true) }} />
          <Button label="Add games" onPress={() => { setActionError(null); setAdding(true) }} />
        </View>
      ) : null}
      {loadError ? (
        <View style={styles.stack}>
          <Text accessibilityLiveRegion="polite" style={styles.error}>{loadError}</Text>
          {onRetry ? <Button label="Retry" variant="secondary" onPress={onRetry} /> : null}
        </View>
      ) : null}
      {actionError && !removing && !adding ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>{actionError}</Text>
      ) : null}
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
            title="This list is empty"
            description={canEdit ? 'Add a few games to get it started.' : "The owner hasn't added any games yet."}
          />
        )}
        renderItem={({ item }) => (
          <ListGameCell
            game={item}
            canEdit={canEdit}
            width={columnWidth}
            onOpen={onOpen}
            onRemove={() => { setActionError(null); setRemoving(item) }}
          />
        )}
      />
      <ListFormSheet
        visible={editing}
        title="Edit list"
        submitLabel="Save"
        initial={{ name, description, isPublic, isPinned }}
        canDelete={canDelete}
        error={error}
        busy={busy}
        onClose={() => setEditing(false)}
        onSubmit={(values) => { void saveEdit(values) }}
        onDelete={() => { void confirmDelete() }}
      />
      <AddGamesSheet
        visible={adding}
        games={games}
        error={actionError}
        busy={busy}
        onClose={() => setAdding(false)}
        onSearch={onSearch}
        onSave={async (sync, added) => {
          if (!onSaveGames) return
          setBusy(true)
          setActionError(null)
          const next = await onSaveGames(sync, added)
          setBusy(false)
          if (next) {
            setActionError(next)
            return
          }
          setAdding(false)
        }}
      />
      <Sheet
        visible={removing != null}
        title={removing ? `Remove ${removing.name}?` : 'Remove game'}
        onClose={() => setRemoving(null)}
      >
        <Text style={styles.body}>It leaves this list. The game stays in the catalogue.</Text>
        {actionError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{actionError}</Text> : null}
        <Button label={busy ? 'Removing…' : 'Remove'} variant="secondary" disabled={busy} onPress={() => { void confirmRemove() }} />
        <Button label="Keep" variant="ghost" onPress={() => setRemoving(null)} />
      </Sheet>
      <Sheet visible={account} title="Sign up" onClose={() => setAccount(false)}>
        <AccountActions onOpen={onOpen} />
      </Sheet>
    </SafeAreaView>
  )
}

function AddGamesSheet({
  visible,
  games,
  error,
  busy,
  onClose,
  onSearch,
  onSave,
}: {
  visible: boolean
  games: GameCardData[]
  error: string | null
  busy: boolean
  onClose: () => void
  onSearch?: (query: string) => Promise<GameSearchHit[]>
  onSave: (sync: ListGameSync, added: GameSearchHit[]) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<GameSearchHit[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const open = useRef(false)
  const gameKey = games.map(game => game.id).join('\0')

  useEffect(() => {
    if (visible && !open.current) {
      setQuery('')
      setHits([])
      setSelected(games.map(game => game.id))
      setSearchError(null)
    }
    open.current = visible
  }, [visible, gameKey, games])

  async function search() {
    const needle = query.trim()
    if (!needle) {
      setHits([])
      setSearchError('Type a game name.')
      return
    }
    if (!onSearch) return
    setSearching(true)
    setSearchError(null)
    try {
      setHits(await onSearch(needle))
    } catch (failure) {
      setHits([])
      setSearchError(actionFailure(failure))
    } finally {
      setSearching(false)
    }
  }

  function toggle(id: string) {
    setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  const resultIds = new Set(hits.map(hit => hit.id))
  const already = games.filter(game => !resultIds.has(game.id))

  return (
    <Sheet visible={visible} title="Add games" onClose={onClose}>
      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <TextField
            label="Search games"
            hideLabel
            placeholder="Search games"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => { void search() }}
          />
        </View>
        <Button label={searching ? 'Searching…' : 'Search'} disabled={searching} onPress={() => { void search() }} />
      </View>
      {searchError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{searchError}</Text> : null}
      {already.length > 0 ? <Text style={styles.meta}>On this list</Text> : null}
      {already.map(game => (
        <Button
          key={game.id}
          label={game.name}
          accessibilityLabel={selected.includes(game.id) ? `${game.name}, selected` : game.name}
          selected={selected.includes(game.id)}
          variant="secondary"
          onPress={() => toggle(game.id)}
        />
      ))}
      {hits.length > 0 ? <Text style={styles.meta}>Results</Text> : null}
      {hits.map(hit => (
        <Button
          key={hit.id}
          label={hit.name}
          accessibilityLabel={selected.includes(hit.id) ? `${hit.name}, selected` : hit.name}
          selected={selected.includes(hit.id)}
          variant="secondary"
          onPress={() => toggle(hit.id)}
        />
      ))}
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
      <Button
        label={busy ? 'Saving…' : 'Save games'}
        disabled={busy}
        onPress={() => {
          const current = new Set(games.map(game => game.id))
          const next = new Set(selected)
          const toAdd = [...next].filter(id => !current.has(id)).map(id => ({ id }))
          const toRemove = [...current].filter(id => !next.has(id)).map(id => ({ id }))
          const added = hits.filter(hit => next.has(hit.id) && !current.has(hit.id))
          void onSave({ toAdd, toRemove }, added)
        }}
      />
    </Sheet>
  )
}

export function ListDetailSkeleton({ onBack }: { onBack?: () => void }) {
  return (
    <SafeAreaView accessibilityLabel="Loading list" style={styles.screen}>
      <AppHeader onBack={onBack} />
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
  ownerRow: {
    minHeight: hitTarget,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space[2],
  },
  owner: {
    fontFamily: face.body[600],
    fontSize: typeScale.base.size,
    lineHeight: typeScale.base.line,
    color: colors.text,
  },
  meta: {
    fontFamily: face.mono[400],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.muted,
  },
  body: {
    fontFamily: face.body[400],
    fontSize: typeScale.base.size,
    lineHeight: typeScale.base.line,
    color: colors.text,
  },
  action: {
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
  actionText: {
    fontFamily: face.display[600],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.text,
  },
  ownerActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  columns: { gap: space[3] },
  cell: { position: 'relative', marginBottom: space[3] },
  remove: {
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
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  searchField: { flex: 1 },
  stack: { gap: space[2] },
  error: {
    fontFamily: face.body[400],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.bad,
  },
  bone: { height: 28, width: '55%', backgroundColor: colors.surfaceLight, borderRadius: radius.base },
  boneShort: { height: 160, backgroundColor: colors.surfaceLight, borderRadius: radius.base },
})
