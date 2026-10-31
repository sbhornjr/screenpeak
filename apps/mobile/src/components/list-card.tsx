import type { ListCard } from '@screenpeak/shared/api/lists'
import { Pin } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { listHref, profileHref } from '@/lib/routes'
import { useSingleFlight } from '@/lib/single-flight'
import { colors, face, hitTarget, radius, space, text, typeScale } from '@/theme'

import { CoverStrip } from './cover-strip'
import { ListLike, ListMeta } from './list-chrome'

/** What a card shows. Explore's lists have no privacy or pin, so those are optional. */
export type ListCardFields = Pick<
  ListCard,
  'id' | 'name' | 'description' | 'owner_username' | 'last_activity' | 'game_count' | 'like_count' | 'viewer_has_liked' | 'covers'
> & Partial<Pick<ListCard, 'is_public' | 'is_pinned'>>

/** One list: covers, name, meta, description, the owner link, the like heart, and Pin when it is yours. */
export function ListCardView({
  list,
  username,
  canLike,
  canPin,
  onOpen,
  onLike,
  onPin,
  onActionError,
}: {
  list: ListCardFields
  /** Whose lists these are, for a card with no owner username. */
  username: string
  canLike: boolean
  canPin: boolean
  onOpen: (href: string) => void
  onLike?: (listId: string, liked: boolean) => Promise<string | null>
  onPin?: (listId: string, pinned: boolean) => Promise<string | null>
  onActionError: (message: string | null) => void
}) {
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
        <CoverStrip covers={list.covers.map(cover => cover.cover_image_url)} />
        <Text numberOfLines={2} style={styles.cardTitle}>{list.name}</Text>
        <ListMeta gameCount={list.game_count} isPrivate={list.is_public === false} updatedAt={list.last_activity} />
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
            interactive={canLike}
            onPress={() => {
              void flight(async () => {
                const message = await onLike?.(list.id, !list.viewer_has_liked)
                onActionError(message ?? null)
              })
            }}
          />
          {canPin ? (
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

const styles = StyleSheet.create({
  card: {
    gap: space[2],
    padding: space[3],
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    backgroundColor: colors.surface,
    marginBottom: space[3],
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
})
