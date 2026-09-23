import { createClient } from "@/lib/supabase-server";
import GameCard from "@/app/components/game/GameCard";
import Link from "next/link";
import { redirect } from "next/navigation";
import LoadoutActions from "@/app/components/user/LoadoutActions";
import DistributionChart from "@/app/components/util/DistributionChart";
import SectionHead from "@/app/components/util/SectionHead";
import Eyebrow from "@/app/components/util/Eyebrow";
import { getViewer } from "@/lib/queries/user-auth";
import { getUserIdFromUsername, getAccountSettings, getCurrentLoadoutIdentity } from "@/lib/queries/user";
import { getDeveloperNameMap } from "@/lib/queries/game";
import { getLoadoutRatingHighlights } from "@/lib/queries/stats";
import { getUserRatings, getAvgRatingsForGames, getUserRatingsForGames } from "@/lib/queries/review";
import { AvgRatingsData } from "@/types";
import { buildLoadoutInput } from "@/lib/loadout";

type LoadoutPageProps = {
    params: Promise<{ username: string }>
}

function tierColor(rating: number) {
    return rating >= 8 ? 'var(--color-good)' : rating >= 6 ? 'var(--color-mid)' : 'var(--color-bad)'
}

export default async function LoadoutPage({ params } : LoadoutPageProps) {
    const { username } = await params;
    const supabase = await createClient()
    
    const viewer = await getViewer(supabase)
    const ownerId = await getUserIdFromUsername(username)

    if (!ownerId) redirect("/")

    if (!viewer || viewer.id != ownerId.id) {
        const ownerSettings = await getAccountSettings(ownerId.id)
        if (!ownerSettings || !ownerSettings.loadout_public) redirect("/")
    }

    const loadoutInput = await buildLoadoutInput(ownerId.id, username)
    const totalGames = loadoutInput.totalGames
    const completedStat = loadoutInput.completedGames
    const avgRating = loadoutInput.avgRating
    const topGenres = loadoutInput.topGenres
    const topDevelopers = loadoutInput.topDevelopers

    const [highlights, ratingsReviews, currentLoadoutIdentity] = await Promise.all([
        getLoadoutRatingHighlights(ownerId.id),
        getUserRatings(ownerId.id),
        getCurrentLoadoutIdentity(ownerId.id)
    ])

    const ratingDistribution = [10,9,8,7,6,5,4,3,2,1].map(n => ({
        name: n,
        count: ratingsReviews.filter(r => r.rating === n).length
    }))

    const developerMap = await getDeveloperNameMap(highlights.map(h => h.game_id))
    const avgRatings = await getAvgRatingsForGames(highlights.map(h => h.game_id)) as AvgRatingsData[]
    const viewerRatings = viewer ? await getUserRatingsForGames(viewer.id ?? "", highlights.map(h => h.game_id)) : []

    // Only sections with something to show get rendered — an empty labelled
    // section reads as broken.
    const genreFavs = topGenres?.filter(g => g.rated_count > 1).slice(0, 6) ?? []
    const developerFavs = topDevelopers?.filter(d => d.rated_count > 1).slice(0, 6) ?? []
    const topGames = highlights.filter(h => h.highlight_type === "top")
    const bottomGames = highlights.filter(h => h.highlight_type === "bottom")

    const isOwner = !!viewer && viewer.id === ownerId.id
    const loadoutIdentity = currentLoadoutIdentity?.loadout_identity ?? ""
    const canGenerate = loadoutInput.totalRatings >= 5
    const ratingsToUnlock = Math.max(0, 5 - ratingsReviews.length)

    return (
        <main className="bg-(--color-bg)">
            <div className="w-full max-w-6xl mx-auto px-6 md:px-10 pt-8 pb-16 font-(family-name:--font-body)">
                <header className="mb-8">
                    <Eyebrow>Stats screen</Eyebrow>
                    <h1 className="text-4xl md:text-5xl text-(--color-text) font-(family-name:--font-display) mb-2">
                        {username}&apos;s Loadout
                    </h1>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-(--color-muted) tabular-nums">
                        <span><span className="text-(--color-text)">{totalGames}</span> saved</span>
                        <span><span className="text-(--color-text)">{completedStat}</span> completed</span>
                        <span><span className="text-(--color-text)">{ratingsReviews.length}</span> rated</span>
                        <span><span className="text-(--color-text)">{ratingsReviews.length ? Math.trunc(avgRating * 100) / 100 : "—"}</span> avg</span>
                    </div>
                </header>

                {/* Analyst's note beside the rating breakdown — two halves of "who is this player" */}
                <div className="grid md:grid-cols-[1.4fr_1fr] gap-8 md:gap-12 mb-14 items-start">
                    <div className="border border-(--color-border) bg-(--color-surface) rounded-md px-7 py-6 shadow-[inset_0_1px_0_rgba(239,232,215,0.05)]">
                        <Eyebrow className="!text-[10px] !mb-3">The Read-out</Eyebrow>

                        {loadoutIdentity ? (
                            <>
                                <p className="text-lg leading-relaxed text-(--color-text) font-(family-name:--font-body) italic">
                                    &ldquo;{loadoutIdentity}&rdquo;
                                </p>
                                {isOwner && (
                                    <>
                                        <LoadoutActions identity={loadoutIdentity} />
                                        <p className="mt-2 text-right text-[10px] uppercase tracking-[0.2em] text-(--color-muted) font-mono">
                                            drafted with AI · edit anytime
                                        </p>
                                    </>
                                )}
                            </>
                        ) : !canGenerate ? (
                            <>
                                <p className="text-(--color-text) mb-4">
                                    {isOwner
                                        ? `Rate ${ratingsToUnlock} more ${ratingsToUnlock === 1 ? "game" : "games"} to unlock your Read-out.`
                                        : "No Read-out yet."}
                                </p>
                                {isOwner && (
                                    <>
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="flex-1 h-1.5 bg-(--color-surface-light) rounded-full overflow-hidden">
                                                <div className="h-full bg-(--color-accent) rounded-full" style={{ width: `${Math.min(100, (ratingsReviews.length / 5) * 100)}%` }} />
                                            </div>
                                            <span className="font-mono text-xs text-(--color-muted) tabular-nums">{Math.min(ratingsReviews.length, 5)} / 5</span>
                                        </div>
                                        <Link href="/games" className="inline-block px-4 py-2 rounded-[3px] text-sm font-semibold bg-(--color-accent) text-(--color-bg) hover:bg-(--color-accent-hover) transition-colors duration-200">
                                            Find games to rate
                                        </Link>
                                    </>
                                )}
                            </>
                        ) : (
                            <>
                                <p className="text-(--color-text) mb-3">
                                    {isOwner ? "You haven't generated a Read-out yet." : "No Read-out yet."}
                                </p>
                                {isOwner && (
                                    <>
                                        <LoadoutActions identity="" />
                                        <p className="mt-2 text-right text-[10px] uppercase tracking-[0.2em] text-(--color-muted) font-mono">
                                            drafted with AI · edit anytime
                                        </p>
                                    </>
                                )}
                            </>
                        )}
                    </div>

                    <div>
                        <SectionHead>Scoring Style</SectionHead>
                        <DistributionChart data={ratingDistribution} />
                    </div>
                </div>

                {genreFavs.length > 0 && (<>
                <SectionHead>Favorite Genres</SectionHead>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-14">
                        {genreFavs.map(g => (
                            <div key={g.genre_name} className="bg-(--color-surface) border border-(--color-border) rounded-md shadow-[inset_0_1px_0_rgba(239,232,215,0.05)] p-4 flex flex-col gap-2">
                                <h3 className="text-base text-(--color-text) font-(family-name:--font-display)">
                                    {g.genre_name}
                                </h3>
                                <div className="flex items-baseline gap-1.5">
                                    <span
                                        className="text-2xl font-mono"
                                        style={{ color: tierColor(g.weighted_rating) }}
                                    >
                                        {g.weighted_rating}
                                    </span>
                                    <span className="text-xs text-(--color-muted)">avg</span>
                                </div>
                                <p className="text-xs text-(--color-muted)">
                                    {g.rated_count} rated · {g.completed_count} completed
                                </p>
                            </div>
                        ))}
                    </div>
                </>)}

                {developerFavs.length > 0 && (<>
                <SectionHead>Favorite Developers</SectionHead>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-14">
                        {developerFavs.map(d => (
                            <div key={d.developer_name} className="bg-(--color-surface) border border-(--color-border) rounded-md shadow-[inset_0_1px_0_rgba(239,232,215,0.05)] p-4 flex flex-col gap-2">
                                <h3 className="text-base text-(--color-text) font-(family-name:--font-display)">
                                    {d.developer_name}
                                </h3>
                                <div className="flex items-baseline gap-1.5">
                                    <span
                                        className="text-2xl font-mono"
                                        style={{ color: tierColor(d.weighted_rating) }}
                                    >
                                        {d.weighted_rating}
                                    </span>
                                    <span className="text-xs text-(--color-muted)">avg</span>
                                </div>
                                <p className="text-xs text-(--color-muted)">
                                    {d.rated_count} rated · {d.game_count} total
                                </p>
                            </div>
                        ))}
                    </div>
                </>)}

                {topGames.length > 0 && (<>
                <SectionHead>Top Scores</SectionHead>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-14">
                        {topGames.map(h =>
                            <GameCard
                                key={h.game_id}
                                game={{ id: h.game_id, name: h.game_name, slug: h.game_slug, cover_image_url: h.cover_image_url, metacritic_score: h.metacritic_score, released: h.released }}
                                developer={developerMap.get(h.game_id)}
                                ngplusRating={avgRatings.find(r => String(r.game_id) == h.game_id)?.avg_rating}
                                userRating={viewerRatings.find(r => String(r.game_id) == h.game_id)?.rating}
                            />
                        )}
                    </div>
                </>)}

                {bottomGames.length > 0 && (<>
                <SectionHead>Bottom Scores</SectionHead>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {bottomGames.map(h =>
                            <GameCard
                                key={h.game_id}
                                game={{ id: h.game_id, name: h.game_name, slug: h.game_slug, cover_image_url: h.cover_image_url, metacritic_score: h.metacritic_score, released: h.released }}
                                developer={developerMap.get(h.game_id)}
                                ngplusRating={avgRatings.find(r => String(r.game_id) == h.game_id)?.avg_rating}
                                userRating={viewerRatings.find(r => String(r.game_id) == h.game_id)?.rating}
                            />
                        )}
                    </div>
                </>)}
            </div>
        </main>
    )
}