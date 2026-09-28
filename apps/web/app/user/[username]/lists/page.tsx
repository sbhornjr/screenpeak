import type { Metadata } from "next";
import { createClient } from "@/lib/supabase-server";
import { notFound } from "next/navigation";
import ListPreview from "@/app/components/lists/ListPreview";
import CreateListButton from "@/app/components/lists/CreateListButton";
import Link from "next/link";
import { ListWithOwner } from "@screenpeak/shared/types";
import { getViewer } from "@/lib/queries/user-auth";
import { getProfileSummaryByUsername, getAccountSettings } from "@/lib/queries/user";
import { getUserLists, getLikedLists, getListCoverMap, getListLikes } from "@/lib/queries/list";
import Eyebrow from "@/app/components/util/Eyebrow";

type ListsPageProps = {
    params: Promise<{ username: string, tab?: string }>
    searchParams: Promise<{ tab?: string }>
}

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
    const { username } = await params
    return {
        title: `${username}'s Lists`,
        description: `Game lists curated by ${username} on ScreenPeak.`,
    }
}

export default async function ListsPage({ params, searchParams }: ListsPageProps) {
    const { username } = await params;
    const { tab } = await searchParams;
    const supabase = await createClient()
    const viewer = await getViewer(supabase)

    const profile = await getProfileSummaryByUsername(username)

    if (!profile) notFound()
    const isOwnProfile = viewer?.id === profile.id

    const listsData = !tab || tab === 'user'
        ? await getUserLists(profile.id, isOwnProfile)
        : await getLikedLists(profile.id)

    const lists = listsData as ListWithOwner[]

    const listIds = lists.map(l => l.id) ?? []

    const coversByList = await getListCoverMap(listIds)

    const likesData = await getListLikes(listIds)

    const userSettings = await getAccountSettings(profile.id)

    const likeCountMap = new Map<string, number>()
    const userLikedSet = new Set<string>()

    for (const like of likesData ?? []) {
        likeCountMap.set(like.list_id, (likeCountMap.get(like.list_id) || 0) + 1)
        if (viewer && like.user_id === viewer.id) {
            userLikedSet.add(like.list_id)
        }
    }

    return (
        <main>
            <div className="w-full max-w-6xl mx-auto px-6 sm:px-8 pt-8 pb-16 flex flex-col gap-2">
                <Eyebrow>Collections</Eyebrow>
                <h1 className="text-4xl font-bold font-(family-name:--font-display) tracking-tight mb-4">
                    {isOwnProfile ? 'Your Lists' : `${username}’s Lists`}
                </h1>
                <div className="flex gap-4 border-b border-(--color-border) mb-8">
                    <Link
                        href={`/user/${username}/lists`}
                        className={`px-4 py-2 text-sm font-semibold transition-colors duration-200
                            border-b-2 -mb-px
                            ${!tab || tab === 'user'
                                ? 'border-(--color-accent) text-(--color-accent)'
                                : 'border-transparent text-(--color-muted) hover:text-(--color-accent)'}`}
                    >
                        {isOwnProfile ? 'My Lists' : `${username}’s Lists`}
                    </Link>
                    <Link
                        href={`/user/${username}/lists?tab=liked`}
                        className={`px-4 py-2 text-sm font-semibold transition-colors duration-200
                        border-b-2 -mb-px
                        ${tab === 'liked'
                            ? 'border-(--color-accent) text-(--color-accent)'
                            : 'border-transparent text-(--color-muted) hover:text-(--color-accent)'}`}
                    >
                        Liked Lists
                    </Link>
                </div>
                {viewer && viewer.id && isOwnProfile && <CreateListButton defaultListPrivacy={userSettings?.default_list_public ?? true} />}
                {lists.map(l =>
                    <ListPreview 
                        key={l.id} 
                        listId={l.id} 
                        username={l.owner_username} 
                        listName={l.name} 
                        isPinned={l.is_pinned} 
                        isPinnable={l.owner_id === viewer?.id} 
                        isLikable={l.owner_id !== viewer?.id}
                        lastUpdated={l.last_activity} 
                        description={l.description} 
                        gameCovers={coversByList.get(String(l.id))} 
                        listCount={l.game_count}
                        likeCount={likeCountMap.get(String(l.id)) ?? 0} 
                        userHasLiked={userLikedSet.has(String(l.id))} 
                        activeUserId={viewer?.id} 
                        fullLength={false}
                    />
                )}
            </div>
        </main>
    )
}