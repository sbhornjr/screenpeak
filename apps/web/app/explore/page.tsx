import type { Metadata } from "next"
import GameCard from "@/app/components/game/GameCard"
import Link from "next/link"
import ListPreview from "../components/lists/ListPreview"
import UserCard from "../components/user/UserCard"
import { getOptionalUser } from "@/lib/auth"
import SectionHead from "@/app/components/util/SectionHead"
import Eyebrow from "@/app/components/util/Eyebrow"
import { loadExplore } from "@/lib/loaders/explore"
import { parseExploreQueryLenient } from "@/lib/screen-query"

type ExplorePageProps = {
    searchParams: Promise<{ range?: string }>
}

export const metadata: Metadata = {
    title: "Explore",
    description: "Trending games, top-rated picks, and what players on ScreenPeak are playing right now.",
}

export default async function Explore({ searchParams }: ExplorePageProps) {
    const { range } = await searchParams

    const viewer = await getOptionalUser()
    const { range: rangeString } = parseExploreQueryLenient({ range })
    const explore = await loadExplore(viewer?.id ?? null, rangeString)
    const trendingGames = explore.trending_games
    const trendingLists = explore.trending_lists
    const recommendedGames = explore.recommendations?.games ?? []
    const recommendedLists = explore.recommendations?.lists ?? []
    const recommendedUsers = explore.recommendations?.users ?? []

    return (
        <main>
            <div className="max-w-6xl mx-auto w-full px-6 sm:px-8 pt-8 pb-4">
                <Eyebrow>Discover</Eyebrow>
                <h1 className="text-4xl font-bold font-(family-name:--font-display) tracking-tight">
                    Explore
                </h1>
            </div>

            <div className="flex flex-col pt-4 pb-8 w-full max-w-6xl mx-auto px-6 sm:px-8">
                <div className="flex gap-1 mb-8">
                    {["week", "month", "year", "alltime"].map(r => (
                        <Link
                            key={r}
                            href={`/explore?range=${r}`}
                            className={`px-3 py-1 rounded-[3px] text-sm font-semibold transition-colors duration-200
                            ${range === r
                            ? "bg-(--color-accent) text-(--color-bg)"
                            : "text-(--color-muted) hover:text-(--color-accent)"}`}
                        >
                            {r === "week" ? "This Week" : r === "month" ? "This Month" : r === "year" ? "This Year" : "All Time"}
                        </Link>
                    ))}
                </div>

                <SectionHead>Peak right now</SectionHead>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                    {trendingGames.map(game => (
                        <GameCard
                            key={game.id}
                            game={{ id: game.id, name: game.name, slug: game.slug, cover_image_url: game.cover_image_url, released: game.released }}
                            developer={game.developer}
                            ngplusRating={game.avg_rating}
                            userRating={game.user_rating} />
                    ))}
                </div>

                {viewer && (
                    <div className="flex flex-col pt-8 pb-2 w-full">
                        <SectionHead>Recommended For You</SectionHead>
                        <p className="text-sm text-(--color-muted) mb-2 text-left w-full">
                            Follow more users to get more recommendations.
                        </p>
                        {recommendedGames.length > 0 && (
                            <div className="flex flex-col pt-4 pb-8 w-full">
                                <SectionHead>Recommended Games</SectionHead>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                                    {recommendedGames.map(game => (
                                        <div key={game.id} className="flex flex-col gap-1">
                                            <p className="text-xs text-(--color-muted) text-center">
                                                <span className="text-(--color-accent) font-semibold">{game.follower_count}</span>
                                                {game.follower_count === 1 ? ' follower' : ' followers'} completed · {game.avg_follower_rating}/10 avg
                                            </p>
                                            <GameCard
                                                game={{ id: game.id, name: game.name, slug: game.slug, cover_image_url: game.cover_image_url, released: game.released }}
                                                developer={game.developer}
                                                ngplusRating={game.avg_rating}
                                                userRating={null}
                                            />
                                            {game.library_status !== 'none' && (
                                                <p className="text-xs text-(--color-muted) text-center">
                                                {game.library_status === 'backlog' ? 'In your backlog' : 'On your wishlist'}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {recommendedLists.length > 0 && (
                            <div className="flex flex-col pt-4 pb-8 w-full max-w-6xl mx-auto">
                                <SectionHead>Recommended Lists</SectionHead>
                                <div className="flex flex-col gap-4 w-full">
                                    {recommendedLists.map(list => (
                                        <div key={list.id} className="flex flex-col gap-0.5 w-full">
                                            <div className="text-xs text-(--color-muted) mb-2 text-left">
                                                <span className="text-(--color-accent) font-semibold">{list.follower_like_count}</span>
                                                {list.follower_like_count === 1 ? ' user' : ' users'} you follow liked this
                                            </div>
                                            <ListPreview
                                                listId={list.id}
                                                listName={list.name}
                                                description={list.description}
                                                username={list.owner_username}
                                                listCount={list.game_count}
                                                likeCount={list.like_count}
                                                gameCovers={list.covers.map(cover => ({ coverImageUrl: cover.cover_image_url, slug: cover.slug }))}
                                                isPinnable={false}
                                                isLikable={true}
                                                isPinned={false}
                                                userHasLiked={list.viewer_has_liked}
                                                activeUserId={viewer?.id}
                                                lastUpdated={list.last_activity}
                                                fullLength={true}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {recommendedUsers.length > 0 && (
                            <div className="flex flex-col pt-4 pb-8 w-full">
                                <SectionHead>Recommended Users</SectionHead>
                                <div className="grid grid-col grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
                                    {recommendedUsers.map(user => (
                                        <div key={user.id} className="flex flex-col gap-2 w-full">
                                            <p className="text-sm text-left text-(--color-muted) mt-2">followed by
                                                <span className="text-(--color-accent) font-semibold">{" " + user.mutual_follower_count}</span> users you follow</p>
                                            <UserCard
                                                username={user.username}
                                                avatarUrl={user.avatar_url}
                                                title={user.selected_title}
                                                createdAt={user.created_at}
                                                followerCount={user.follower_count}
                                                followingCount={user.following_count}
                                                gameCount={user.game_count ?? 0}
                                                avgRating={user.avg_rating ?? 0}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <SectionHead>Lists peaking now</SectionHead>
                <div className="flex flex-col gap-4 w-full">
                    {trendingLists.map(list => (
                        <ListPreview
                            key={list.id}
                            listId={list.id}
                            listName={list.name}
                            gameCovers={list.covers.map(cover => ({ coverImageUrl: cover.cover_image_url, slug: cover.slug }))}
                            isPinnable={false}
                            isLikable={true}
                            description={list.description}
                            lastUpdated={list.last_activity}
                            username={list.owner_username}
                            listCount={list.game_count}
                            likeCount={list.like_count}
                            userHasLiked={list.viewer_has_liked}
                            activeUserId={viewer?.id}
                            fullLength={true}
                        />
                    ))}
                </div>
            </div>
        </main>
    )
}