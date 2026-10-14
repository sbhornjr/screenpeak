"use client"

import Link from "next/link"
import Avatar from "@/app/components/user/Avatar"
import { parseDbTimestamp } from "@/lib/dates"

export default function UserCard({ username, avatarUrl, title, createdAt, followerCount, followingCount, gameCount, avgRating } : 
    { username: string, avatarUrl: string | null, title: string | null, createdAt: string, followerCount: number, followingCount: number, gameCount: number, avgRating: number }) {

    return (
        <Link href={`/user/${username}`}
            className="border border-(--color-border) hover:border-(--color-accent)/50 rounded-[3px] 
                flex items-center gap-4 p-4 transition-all duration-200 group">
            
            <Avatar src={avatarUrl} alt={username} size="md" bordered />

            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <p className="font-bold text-(--color-text) group-hover:text-(--color-accent) 
                    transition-colors duration-200 font-(family-name:--font-display) truncate">
                    {username}
                </p>
                <p className="text-xs text-(--color-accent) font-semibold font-(family-name:--font-display)">
                    {title ?? "Title-less Noob"}
                </p>
                <p className="text-xs text-(--color-muted)">
                    Member since {parseDbTimestamp(createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </p>
                <p className="text-xs text-(--color-muted)">
                    {followerCount} followers · {followingCount} following
                </p>
            </div>

            <div className="flex gap-3 shrink-0">
                <div className="text-center">
                    <p className="text-lg text-(--color-accent) font-mono">{gameCount}</p>
                    <p className="text-xs text-(--color-muted)">Games</p>
                </div>
                <div className="text-center">
                    <p className="text-lg text-(--color-accent) font-mono">{avgRating ?? '—'}</p>
                    <p className="text-xs text-(--color-muted)">Avg</p>
                </div>
            </div>
        </Link>
    )
} 