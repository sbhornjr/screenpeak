import type { ListCard, ListsTab } from '@screenpeak/shared/api/lists'
import type { ListWrite } from '@screenpeak/shared/api/writes'
import { ChevronDown } from 'lucide-react-native'
import { useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useSingleFlight } from '@/lib/single-flight'
import { colors, face, hitTarget, radius, space, text, typeScale } from '@/theme'

import { AppHeader } from './app-header'
import { Button } from './button'
import { EmptyState } from './empty-state'
import { ListCardView } from './list-card'
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
          <ListCardView
            list={item}
            username={username}
            canLike={signedIn && viewerId != null && item.owner_id !== viewerId}
            canPin={signedIn && viewerId != null && item.owner_id === viewerId}
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
  stack: { gap: space[2] },
  bone: { height: 28, width: '55%', backgroundColor: colors.surfaceLight, borderRadius: radius.base },
  boneShort: { height: 120, backgroundColor: colors.surfaceLight, borderRadius: radius.base },
})
