import type { Metadata } from "next"
import { notFound } from "next/navigation"
import ListPreview from "@/app/components/lists/ListPreview"
import CreateListButton from "@/app/components/lists/CreateListButton"
import Link from "next/link"
import { getOptionalUser } from "@/lib/auth"
import { loadUserLists } from "@/lib/loaders/lists-page"
import { parseListsTabLenient } from "@/lib/screen-query"
import Eyebrow from "@/app/components/util/Eyebrow"
import EmptyState from "@/app/components/util/EmptyState"
import type { ListsPageData } from "@screenpeak/shared/api/lists"

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
    const { username } = await params
    const raw = await searchParams
    const viewer = await getOptionalUser()
    const { tab } = parseListsTabLenient(raw)
    let data: ListsPageData | null
    try {
        data = await loadUserLists(username, viewer?.id ?? null, tab)
    } catch {
        return (
            <main>
                <div className="w-full max-w-6xl mx-auto px-6 sm:px-8 pt-8 pb-16">
                    <EmptyState title="Couldn't load these lists" description="Try again in a moment." />
                </div>
            </main>
        )
    }

    if (!data) notFound()
    const isOwnProfile = viewer?.id === data.profile.id
    const lists = data.lists
    const userSettingsPublic = data.default_list_public

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
                            ${tab === 'user'
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
                {viewer && viewer.id && isOwnProfile && <CreateListButton defaultListPrivacy={userSettingsPublic ?? true} />}
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
                        gameCovers={l.covers.map(cover => ({ coverImageUrl: cover.cover_image_url, slug: cover.slug }))}
                        listCount={l.game_count}
                        likeCount={l.like_count}
                        userHasLiked={l.viewer_has_liked}
                        activeUserId={viewer?.id}
                        fullLength={false}
                    />
                )}
            </div>
        </main>
    )
}