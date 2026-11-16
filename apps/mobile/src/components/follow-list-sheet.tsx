import type { FollowListEntry, FollowListPage } from '@screenpeak/shared/api/profile'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { api } from '@/lib/api'
import { actionFailure } from '@/lib/failure'
import { go } from '@/lib/go'
import { queryKeys } from '@/lib/query-keys'
import { profileHref } from '@/lib/routes'
import { useAction } from '@/lib/use-action'
import { colors, face, space, text, typeScale } from '@/theme'

import { ActionError } from './action-error'
import { Avatar } from './avatar'
import { Button } from './button'
import { Sheet } from './sheet'

type Kind = 'followers' | 'following'

const TITLES: Record<Kind, string> = { followers: 'Followers', following: 'Following' }
const EMPTY: Record<Kind, string> = { followers: 'No followers yet.', following: 'Not following anyone yet.' }

/**
 * One row. Modeled on BlockedRow in settings-screen.tsx: avatar, username,
 * a per-row useAction for the write, and its own ActionError. The Follow
 * control is a sibling of the row's own Pressable (not nested inside it),
 * so pressing it never also triggers the row's navigate-away press. Hidden
 * entirely for the viewer's own row or when signed out.
 *
 * `following` comes from `entry.is_following`, not local state: the row's
 * own cache (via `onToggled`) is the single source of truth, so closing and
 * reopening the sheet — which remounts this row — can't show a stale label.
 */
function FollowListRow({ entry, viewerId, onOpen, onToggled }: {
  entry: FollowListEntry
  viewerId: string | null
  onOpen: (username: string) => void
  onToggled: (id: string, following: boolean) => void
}) {
  const toggle = useAction()
  const showButton = viewerId != null && viewerId !== entry.id
  const following = entry.is_following

  function press() {
    const next = !following
    void toggle.run(async () => {
      try {
        if (following) await api.users.unfollow(entry.id)
        else await api.users.follow(entry.id)
        return null
      } catch (error) {
        return actionFailure(error)
      }
    }, () => onToggled(entry.id, next))
  }

  return (
    <View style={styles.stack}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={entry.username}
          onPress={() => onOpen(entry.username)}
          style={styles.rowLink}
        >
          <Avatar src={entry.avatar_url} alt={entry.username} size="sm" />
          <Text numberOfLines={1} style={styles.rowText}>{entry.username}</Text>
        </Pressable>
        {showButton ? (
          <Button
            label={toggle.busy ? (following ? 'Unfollowing…' : 'Following…') : (following ? 'Following' : 'Follow')}
            accessibilityLabel={following ? `Unfollow ${entry.username}` : `Follow ${entry.username}`}
            variant={following ? 'secondary' : 'primary'}
            disabled={toggle.busy}
            onPress={press}
          />
        ) : null}
      </View>
      <ActionError error={toggle.error} onRetry={toggle.canRetry ? toggle.retry : undefined} />
    </View>
  )
}

/** The followers or following list for one player, as a bottom sheet. */
export function FollowListSheet({ visible, username, kind, viewerId, onClose }: {
  visible: boolean
  username: string
  kind: Kind
  viewerId: string | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const queryKey = queryKeys.followList(username, kind, viewerId)
  const query = useQuery({
    queryKey,
    queryFn: () => kind === 'followers' ? api.users.followers(username) : api.users.following(username),
    enabled: visible,
  })

  function openProfile(rowUsername: string) {
    onClose()
    go(profileHref(rowUsername))
  }

  function updateFollowing(id: string, following: boolean) {
    queryClient.setQueryData<FollowListPage>(queryKey, page =>
      page ? { users: page.users.map(u => u.id === id ? { ...u, is_following: following } : u) } : page)
  }

  const entries = query.data?.users ?? []

  return (
    <Sheet visible={visible} title={TITLES[kind]} onClose={onClose}>
      {query.isError ? (
        <ActionError error={actionFailure(query.error)} onRetry={() => { void query.refetch() }} />
      ) : query.isSuccess && entries.length === 0 ? (
        <Text style={text.muted}>{EMPTY[kind]}</Text>
      ) : (
        entries.map(entry => (
          <FollowListRow key={entry.id} entry={entry} viewerId={viewerId} onOpen={openProfile} onToggled={updateFollowing} />
        ))
      )}
    </Sheet>
  )
}

function countLine(followers: number, following: number): string {
  const followerWord = followers === 1 ? 'follower' : 'followers'
  return `${followers} ${followerWord} · ${following} following`
}

/**
 * The counts line ProfileHub renders; owns which list (if any) is open.
 * The sheet is only mounted once a list is opened, not kept mounted with
 * `visible={false}` — this component has no QueryClientProvider of its
 * own, and the common case (never tapped) must not require one.
 */
export function FollowListTrigger({ username, followerCount, followingCount, viewerId }: {
  username: string
  followerCount: number
  followingCount: number
  viewerId: string | null
}) {
  const [open, setOpen] = useState<Kind | null>(null)
  const [followersLabel, followingLabel] = countLine(followerCount, followingCount).split(' · ')
  return (
    <>
      <Text style={text.meta}>
        <Text accessibilityRole="button" accessibilityLabel={`${followerCount} followers`} onPress={() => setOpen('followers')}>
          {followersLabel}
        </Text>
        {' · '}
        <Text accessibilityRole="button" accessibilityLabel={`${followingCount} following`} onPress={() => setOpen('following')}>
          {followingLabel}
        </Text>
      </Text>
      {open ? (
        <FollowListSheet visible username={username} kind={open} viewerId={viewerId} onClose={() => setOpen(null)} />
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  stack: { gap: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  rowLink: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[3], minWidth: 0 },
  rowText: {
    flex: 1,
    minWidth: 0,
    fontFamily: face.body[400],
    fontSize: typeScale.base.size,
    lineHeight: typeScale.base.line,
    color: colors.text,
  },
})
