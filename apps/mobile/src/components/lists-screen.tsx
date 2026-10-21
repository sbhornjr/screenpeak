import type { ListCard, ListsTab } from '@screenpeak/shared/api/lists'
import type { ListWrite } from '@screenpeak/shared/api/writes'
import { Image } from 'expo-image'
import { ChevronDown, Heart, Pin } from 'lucide-react-native'
import { useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { igdbImageUri } from '@/lib/catalog-image'
import { gamesLabel, likeActionLabel, likeLabel, updatedLabel } from '@/lib/lists-page'
import { useSingleFlight } from '@/lib/single-flight'
import { listHref, profileHref } from '@/lib/routes'
import { colors, face, hitTarget, radius, space, typeScale } from '@/theme'

import { AppHeader } from './app-header'
import { Button } from './button'
import { EmptyState } from './empty-state'
import { ListFormSheet, type ListFormValues } from './list-form-sheet'
import { Sheet, useSheetDismiss } from './sheet'

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

function AccountSheet({ visible, onClose, onOpen }: { visible: boolean, onClose: () => void, onOpen: (href: string) => void }) {
  return (
    <Sheet visible={visible} title="Sign up" onClose={onClose}>
      <AccountActions onOpen={onOpen} />
    </Sheet>
  )
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

function ListCardRow({
  list,
  username,
  viewerId,
  onOpen,
  onLike,
  onPin,
  onNeedAccount,
  onActionError,
}: {
  list: ListCard
  username: string
  viewerId: string | null
  onOpen: (href: string) => void
  onLike?: (listId: string, liked: boolean) => Promise<string | null>
  onPin?: (listId: string, pinned: boolean) => Promise<string | null>
  onNeedAccount: () => void
  onActionError: (message: string | null) => void
}) {
  const mine = viewerId != null && list.owner_id === viewerId
  const updated = updatedLabel(list.last_activity)
  const flight = useSingleFlight()
  return (
    <View style={styles.card}>
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
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={list.name}
        onPress={() => onOpen(listHref(list.owner_username || username, list.id))}
        style={styles.cardTitlePress}
      >
        <Text numberOfLines={2} style={styles.cardTitle}>{list.name}</Text>
      </Pressable>
      <Text style={styles.meta}>
        {gamesLabel(list.game_count)}
        {list.is_public ? '' : ' · Private'}
        {updated ? ` · ${updated}` : ''}
      </Text>
      {list.description ? <Text numberOfLines={3} style={styles.body}>{list.description}</Text> : null}
      {list.owner_username ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={list.owner_username}
          onPress={() => onOpen(profileHref(list.owner_username))}
          style={styles.ownerLink}
        >
          <Text style={styles.owner}>{list.owner_username}</Text>
        </Pressable>
      ) : null}
      <View style={styles.actions}>
        {!mine ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={likeActionLabel(list.viewer_has_liked, list.name, list.like_count)}
            onPress={() => {
              if (!viewerId) {
                onNeedAccount()
                return
              }
              void flight(async () => {
                const message = await onLike?.(list.id, !list.viewer_has_liked)
                onActionError(message ?? null)
              })
            }}
            style={styles.action}
          >
            <Heart size={16} color={list.viewer_has_liked ? colors.accent : colors.muted} />
            <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.actionText}>
              {likeLabel(list.viewer_has_liked, list.like_count)}
            </Text>
          </Pressable>
        ) : null}
        {mine ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={list.is_pinned ? `Unpin ${list.name}` : `Pin ${list.name}`}
            onPress={() => {
              void flight(async () => {
                const message = await onPin?.(list.id, !list.is_pinned)
                onActionError(message ?? null)
              })
            }}
            style={styles.action}
          >
            <Pin size={16} color={list.is_pinned ? colors.accent : colors.muted} />
            <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.actionText}>
              {list.is_pinned ? 'Pinned' : 'Pin'}
            </Text>
          </Pressable>
        ) : null}
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
  const [account, setAccount] = useState(false)
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
      {actionError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{actionError}</Text> : null}
      {loadError ? (
        <View style={styles.stack}>
          <Text accessibilityLiveRegion="polite" style={styles.error}>{loadError}</Text>
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
            onNeedAccount={() => setAccount(true)}
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
      <AccountSheet visible={account} onClose={() => setAccount(false)} onOpen={onOpen} />
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
  cardTitlePress: { minHeight: hitTarget, justifyContent: 'center' },
  cardTitle: {
    fontFamily: face.display[600],
    fontSize: typeScale.xl.size,
    lineHeight: typeScale.xl.line,
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
  ownerLink: { minHeight: hitTarget, justifyContent: 'center' },
  owner: {
    fontFamily: face.body[600],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.accent,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  action: {
    minHeight: hitTarget,
    minWidth: hitTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[3],
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  actionText: {
    fontFamily: face.display[600],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.text,
  },
  stack: { gap: space[2] },
  error: {
    fontFamily: face.body[400],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.bad,
  },
  bone: { height: 28, width: '55%', backgroundColor: colors.surfaceLight, borderRadius: radius.base },
  boneShort: { height: 120, backgroundColor: colors.surfaceLight, borderRadius: radius.base },
})
