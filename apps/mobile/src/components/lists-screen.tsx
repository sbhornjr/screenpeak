import type { ListCard, ListsTab } from '@screenpeak/shared/api/lists'
import type { ListWrite } from '@screenpeak/shared/api/writes'
import { Image } from 'expo-image'
import { ChevronDown, Pin } from 'lucide-react-native'
import { useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { igdbImageUri } from '@/lib/catalog-image'
import { listHref, profileHref } from '@/lib/routes'
import { useSingleFlight } from '@/lib/single-flight'
import { colors, face, hitTarget, radius, space, text, typeScale } from '@/theme'

import { AppHeader } from './app-header'
import { Button } from './button'
import { EmptyState } from './empty-state'
import { ListLike, ListMeta } from './list-chrome'
import { ListFormSheet, type ListFormValues } from './list-form-sheet'
import { Sheet } from './sheet'

const EMPTY_FORM: ListFormValues = { name: '', description: '', isPublic: true, isPinned: false }

export type ListsScreenProps = {
  title?: string
  username?: string
  show?: { tab: ListsTab, label: string }
  shows?: { tab: ListsTab, label: string }[]
  lists?: ListCard[]
  viewerId?: string | null
  canCreate?: boolean
  defaultPublic?: boolean
  signedIn?: boolean
  refreshing?: boolean
  loadError?: string | null
  onOpen: (href: string) => void
  onBack?: () => void
  onShow?: (tab: ListsTab) => void
  onCreate?: (input: ListWrite) => Promise<string | null>
  onLike?: (listId: string, liked: boolean) => Promise<string | null>
  onPin?: (listId: string, pinned: boolean) => Promise<string | null>
  onRefresh?: () => void
  onRetry?: () => void
}

function MenuTrigger({ label, onPress }: { label: string, onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.menuTrigger}>
      <Text numberOfLines={1} style={styles.menuLabel}>{label}</Text>
      <ChevronDown size={16} color={colors.muted} />
    </Pressable>
  )
}

function ListCardRow({
  list,
  username,
  viewerId,
  onOpen,
  onLike,
  onPin,
  onActionError,
}: {
  list: ListCard
  username: string
  viewerId: string | null
  onOpen: (href: string) => void
  onLike?: (listId: string, liked: boolean) => Promise<string | null>
  onPin?: (listId: string, pinned: boolean) => Promise<string | null>
  onActionError: (message: string | null) => void
}) {
  const mine = viewerId != null && list.owner_id === viewerId
  const flight = useSingleFlight()
  const openList = () => onOpen(listHref(list.owner_username || username, list.id))
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={list.name}
        onPress={openList}
        style={styles.cardBody}
      >
        {list.covers.length > 0 ? (
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.covers}>
            {list.covers.slice(0, 5).map(cover => {
              const uri = igdbImageUri(cover.cover_image_url)
              return uri ? (
                <Image key={cover.slug ?? uri} source={uri} style={styles.cover} contentFit="cover" />
              ) : (
                <View key={cover.slug ?? 'empty'} style={styles.cover} />
              )
            })}
          </View>
        ) : null}
        <Text numberOfLines={2} style={styles.cardTitle}>{list.name}</Text>
        <ListMeta gameCount={list.game_count} isPrivate={!list.is_public} updatedAt={list.last_activity} />
        {list.description ? <Text numberOfLines={3} style={text.body}>{list.description}</Text> : null}
      </Pressable>
      <View style={styles.footer}>
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onPress={openList}
          style={styles.footerFill}
        />
        {list.owner_username ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={list.owner_username}
            onPress={() => onOpen(profileHref(list.owner_username))}
            style={styles.ownerLink}
          >
            <Text numberOfLines={1} style={styles.owner}>{list.owner_username}</Text>
          </Pressable>
        ) : null}
        <View style={styles.footerEnd}>
          <ListLike
            count={list.like_count}
            liked={list.viewer_has_liked}
            interactive={viewerId != null && !mine}
            onPress={() => {
              void flight(async () => {
                const message = await onLike?.(list.id, !list.viewer_has_liked)
                onActionError(message ?? null)
              })
            }}
          />
          {mine ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={list.is_pinned ? `Unpin ${list.name}` : `Pin ${list.name}`}
              hitSlop={{ top: 13, right: 13, bottom: 13, left: 13 }}
              onPress={() => {
                void flight(async () => {
                  const message = await onPin?.(list.id, !list.is_pinned)
                  onActionError(message ?? null)
                })
              }}
              style={styles.pin}
            >
              <Pin size={18} color={list.is_pinned ? colors.accent : colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  )
}

/** A player's lists, or the lists they have liked. */
export function ListsScreen({
  title = 'Lists',
  username = '',
  show = { tab: 'user', label: 'My lists' },
  shows = [],
  lists = [],
  viewerId = null,
  canCreate = false,
  defaultPublic = true,
  signedIn = false,
  refreshing = false,
  loadError = null,
  onOpen,
  onBack,
  onShow,
  onCreate,
  onLike,
  onPin,
  onRefresh,
  onRetry,
}: ListsScreenProps) {
  const { width } = useWindowDimensions()
  const compact = width <= 375
  const [menu, setMenu] = useState(false)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const flight = useSingleFlight()
  const emptyTitle = show.tab === 'liked' ? 'No liked lists yet.' : 'No lists yet.'
  const emptyDescription = show.tab === 'liked'
    ? (canCreate ? 'Lists you like show up here.' : undefined)
    : (canCreate ? 'Create one to start collecting games.' : undefined)

  function create(values: ListFormValues) {
    void flight(async () => {
      if (!onCreate) return
      setBusy(true)
      setError(null)
      try {
        const next = await onCreate(values)
        if (next) {
          setError(next)
          return
        }
        setCreating(false)
      } finally {
        setBusy(false)
      }
    })
  }

  const header = (
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {shows.length > 0 ? (
        <MenuTrigger label={`Show: ${show.label}`} onPress={() => setMenu(true)} />
      ) : null}
      {canCreate ? <Button label="New list" onPress={() => { setError(null); setCreating(true) }} /> : null}
      {actionError ? <Text accessibilityLiveRegion="polite" style={text.error}>{actionError}</Text> : null}
      {loadError ? (
        <View style={styles.stack}>
          <Text accessibilityLiveRegion="polite" style={text.error}>{loadError}</Text>
          {onRetry ? <Button label="Retry" variant="secondary" onPress={onRetry} /> : null}
        </View>
      ) : null}
    </View>
  )

  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader onBack={onBack} />
      <FlatList
        data={lists}
        keyExtractor={list => list.id}
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={[styles.list, compact && styles.padCompact]}
        ListHeaderComponent={header}
        ListEmptyComponent={(
          <EmptyState dense title={emptyTitle} description={emptyDescription} />
        )}
        renderItem={({ item }) => (
          <ListCardRow
            list={item}
            username={username}
            viewerId={signedIn ? viewerId : null}
            onOpen={onOpen}
            onLike={onLike}
            onPin={onPin}
            onActionError={setActionError}
          />
        )}
      />
      <Sheet visible={menu} title="Show" onClose={() => setMenu(false)}>
        {shows.map(choice => (
          <Button
            key={choice.tab}
            label={choice.label}
            selected={show.tab === choice.tab}
            variant="secondary"
            onPress={() => {
              onShow?.(choice.tab)
              setMenu(false)
            }}
          />
        ))}
      </Sheet>
      <ListFormSheet
        visible={creating}
        title="New list"
        submitLabel="Create list"
        initial={{ ...EMPTY_FORM, isPublic: defaultPublic }}
        canDelete={false}
        error={error}
        busy={busy}
        onClose={() => setCreating(false)}
        onSubmit={(values) => { void create(values) }}
      />
    </SafeAreaView>
  )
}

export function ListsSkeleton({ onBack }: { onBack?: () => void }) {
  return (
    <SafeAreaView accessibilityLabel="Loading lists" style={styles.screen}>
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
  menuTrigger: {
    minHeight: hitTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[3],
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  menuLabel: {
    flex: 1,
    fontFamily: face.display[600],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.text,
  },
  card: {
    gap: space[2],
    padding: space[3],
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    backgroundColor: colors.surface,
    marginBottom: space[3],
  },
  covers: { flexDirection: 'row', gap: space[2] },
  cover: {
    flex: 1,
    maxWidth: space[12],
    height: space[16],
    borderRadius: radius.base,
    backgroundColor: colors.surfaceLight,
  },
  cardBody: { gap: space[2], minHeight: hitTarget },
  cardTitle: {
    fontFamily: face.display[600],
    fontSize: typeScale.xl.size,
    lineHeight: typeScale.xl.line,
    color: colors.text,
  },
  footer: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: hitTarget,
  },
  footerFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  footerEnd: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    zIndex: 1,
  },
  ownerLink: { alignSelf: 'flex-start', flexShrink: 1, zIndex: 1 },
  owner: {
    fontFamily: face.body[600],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.accent,
  },
  pin: { alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  stack: { gap: space[2] },
  bone: { height: 28, width: '55%', backgroundColor: colors.surfaceLight, borderRadius: radius.base },
  boneShort: { height: 120, backgroundColor: colors.surfaceLight, borderRadius: radius.base },
})
