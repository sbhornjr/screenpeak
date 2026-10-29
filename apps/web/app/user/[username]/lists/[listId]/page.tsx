import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import Avatar from "@/app/components/user/Avatar"
import GameCard from "@/app/components/game/GameCard"
import AddToListFromListButton from "@/app/components/lists/AddToListFromListButton"
import RemoveFromListButton from "@/app/components/lists/RemoveFromListButton"
import LikeListButton from "@/app/components/lists/LikeListButton"
import CreateListButton from "@/app/components/lists/CreateListButton"
import EmptyState from "@/app/components/util/EmptyState"
import { getOptionalUser } from "@/lib/auth"
import { loadListPage } from "@/lib/loaders/list-page"
import { getListById } from "@/lib/queries/list"
import { getProfileSummaryByUsername } from "@/lib/queries/user"
import { ArrowLeft } from "lucide-react"

type ListPageProps = {
    params: Promise<{ username: string, listId: string }>
}

// Link previews are fetched logged out, so a private list's name never
// reaches the title or OG tags, even for its owner.
export async function generateMetadata({ params }: ListPageProps): Promise<Metadata> {
    const { username, listId } = await params
    const profile = await getProfileSummaryByUsername(username)
    const list = profile ? await getListById(listId) : null
    if (!profile || !list || list.user_id !== profile.id || !list.is_public) {
        return { title: "List", robots: { index: false } }
    }
    return {
        title: `${list.name} by ${username}`,
        description: list.description || `A game list by ${username} on ScreenPeak.`,
    }
}

export default async function ListPage({ params }: ListPageProps) {
    const { username, listId } = await params
    const viewer = await getOptionalUser()
    let data
    try {
        data = await loadListPage(username, listId, viewer?.id ?? null)
    } catch {
        return (
            <main>
                <div className="w-full max-w-6xl mx-auto px-6 sm:px-8 pt-8 pb-16">
                    <EmptyState title="Couldn't load this list" description="Try again in a moment." />
                </div>
            </main>
        )
    }

    if (!data) notFound()

    const { profile, list, games } = data
    const isOwnProfile = data.viewer?.is_owner ?? false
    const likeCount = data.like_count
    const userHasLiked = data.viewer?.has_liked ?? false

    return (
        <main>
            <div className="w-full max-w-6xl mx-auto px-6 sm:px-8 pt-8 pb-16">
                <Link href={`/user/${username}/lists`} className="inline-flex items-center gap-2 text-(--color-muted)
                    text-sm font-semibold mb-8 hover:text-(--color-accent) transition-colors duration-200 font-(family-name:--font-display)">
                    <ArrowLeft size={16} aria-hidden />
                    {username}&apos;s lists
                </Link>

                <h1 className="text-4xl md:text-5xl font-bold font-(family-name:--font-display) tracking-tight mb-3">{list.name}</h1>
                <div className="flex items-center flex-wrap gap-x-4 gap-y-2 text-sm text-(--color-muted) mb-4">
                    <Link href={`/user/${username}`} className="flex items-center gap-2 font-semibold hover:text-(--color-accent) transition-colors duration-200">
                        <Avatar src={profile.avatar_url} alt={username} size="sm" />
                        {username}
                    </Link>
                    <span className="text-(--color-border)">/</span>
                    <span className="font-mono tabular-nums">{games.length} {games.length === 1 ? 'game' : 'games'}</span>
                    <span className="text-(--color-border)">/</span>
                    <span className="font-mono">Updated {new Date(list.updated_at).getMonth() + 1}/{new Date(list.updated_at).getDate()}/{new Date(list.updated_at).getFullYear()}</span>
                    <span className="text-(--color-border)">/</span>
                    <LikeListButton listId={listId} initialLiked={userHasLiked} initialCount={likeCount} userId={viewer?.id ?? null} />
                </div>
                {list.description && (
                    <p className="text-(--color-muted) max-w-2xl leading-relaxed mb-6">{list.description}</p>
                )}

                {isOwnProfile && (
                    <div className="flex flex-wrap gap-2 mb-8">
                        <CreateListButton type="update" current={{ listId: listId, name: list.name, description: list.description, isPinned: list.is_pinned, isPublic: list.is_public}} />
                        <AddToListFromListButton listId={listId} currentGames={games.map(g => ({ id: g.id, name: g.name, slug: g.slug, cover_image_url: g.cover_image_url, released: g.released }))} />
                    </div>
                )}

                {games && games.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {games.map(game => (
                            <div key={game.id} className="flex flex-col gap-1">
                                <GameCard game={{ id: game.id, name: game.name, slug: game.slug, cover_image_url: game.cover_image_url, released: game.released }} developer={game.developer} userRating={game.user_rating} ngplusRating={game.avg_rating}/>
                                {isOwnProfile && (
                                    <RemoveFromListButton listId={listId} gameId={game.id} />
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <EmptyState
                        dense
                        title="This list is empty"
                        description={isOwnProfile ? "Add a few games to get it started." : "The owner hasn't added any games yet."}
                    />
                )}
            </div>
        </main>
    )
}