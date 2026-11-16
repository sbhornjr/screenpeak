'use client'

import { useEffect, useState } from "react"
import Link from "next/link"
import Modal from "@/app/components/util/Modal"
import Avatar from "@/app/components/user/Avatar"
import FollowButton from "@/app/components/user/FollowButton"
import { listFollowers, listFollowing } from "@/app/user-actions"
import type { FollowListEntry } from "@screenpeak/shared/api/profile"

type Kind = 'followers' | 'following'

const TITLES: Record<Kind, string> = { followers: "Followers", following: "Following" }
const EMPTY: Record<Kind, string> = { followers: "No followers yet.", following: "Not following anyone yet." }

const ROW = "flex items-center gap-3 min-w-0 px-3 py-2 border border-(--color-border) rounded-[3px]"
const NAME = "text-sm font-semibold text-(--color-text) font-(family-name:--font-display) truncate flex-1"

/**
 * An empty resolved list covers two cases on purpose — a real empty list and
 * the target having blocked the viewer (loadFollowList returns null for
 * both; the Server Actions turn that into []) — so the viewer never learns
 * which one it was.
 */
function FollowListModal({ username, kind, viewerId, onClose }: {
    username: string
    kind: Kind
    viewerId: string | null
    onClose: () => void
}) {
    const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading')
    const [entries, setEntries] = useState<FollowListEntry[]>([])

    useEffect(() => {
        let cancelled = false
        const fetcher = kind === 'followers' ? listFollowers : listFollowing
        fetcher(username)
            .then(rows => {
                if (cancelled) return
                setEntries(rows)
                setState('loaded')
            })
            .catch(() => {
                if (!cancelled) setState('error')
            })
        return () => { cancelled = true }
    }, [username, kind])

    return (
        <Modal
            onClose={onClose}
            title={TITLES[kind]}
            titleClassName="font-semibold text-2xl mb-4 self-center font-(family-name:--font-display)"
            panelClassName="w-full max-w-md p-6 max-h-[80vh] flex flex-col"
        >
            <div className="flex flex-col gap-2 overflow-y-auto">
                {state === 'loading' && <p className="text-sm text-(--color-muted)">Loading…</p>}
                {state === 'error' && (
                    <p role="alert" className="text-sm font-semibold text-(--color-bad)">
                        Couldn&apos;t load this list. Try again in a moment.
                    </p>
                )}
                {state === 'loaded' && entries.length === 0 && (
                    <p className="text-sm text-(--color-muted)">{EMPTY[kind]}</p>
                )}
                {state === 'loaded' && entries.map(entry => (
                    <div key={entry.id} className={ROW}>
                        <Link href={`/user/${entry.username}`} onClick={onClose} className="flex items-center gap-3 min-w-0 flex-1">
                            <Avatar src={entry.avatar_url} alt={entry.username} size="sm" />
                            <span className={NAME}>{entry.username}</span>
                        </Link>
                        {viewerId && viewerId !== entry.id && (
                            <FollowButton targetUserId={entry.id} initialIsFollowing={entry.is_following} />
                        )}
                    </div>
                ))}
            </div>
        </Modal>
    )
}

/** The counts line on a profile; owns which list (if any) is open. */
export default function FollowCounts({ username, followerCount, followingCount, viewerId }: {
    username: string
    followerCount: number
    followingCount: number
    viewerId: string | null
}) {
    const [open, setOpen] = useState<Kind | null>(null)
    return (
        <>
            <p className="text-md font-semibold font-(family-name:--font-display) text-(--color-muted)">
                <button type="button" onClick={() => setOpen('followers')} className="hover:text-(--color-accent) transition-colors duration-200">
                    {followerCount} Followers
                </button>
                {' | '}
                <button type="button" onClick={() => setOpen('following')} className="hover:text-(--color-accent) transition-colors duration-200">
                    {followingCount} Following
                </button>
            </p>
            {open && (
                <FollowListModal username={username} kind={open} viewerId={viewerId} onClose={() => setOpen(null)} />
            )}
        </>
    )
}
