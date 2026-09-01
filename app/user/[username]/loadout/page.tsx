import { createClient } from "@/lib/supabase-server";
import GameCard from "@/app/components/game/GameCard";
import Link from "next/link";
import { redirect } from "next/navigation";
import { generateLoadoutIdentity } from "@/lib/loadout";
import SubmitBioButton from "@/app/components/user/SubmitBioButton";
import DistributionChart from "@/app/components/util/DistributionChart";
import SectionHead from "@/app/components/util/SectionHead";
import { getViewer, getUserIdFromUsername, getAccountSettings } from "@/lib/queries/user";
import { getDeveloperNameMap } from "@/lib/queries/game";
import { getLoadoutGenreStats, getLoadoutDeveloperStats, getLoadoutStatusBreakdown, getLoadoutRatingHighlights } from "@/lib/queries/stats";
import { getUserRatings, getAvgRatingsForGames, getUserRatingsForGames } from "@/lib/queries/review";
import { AvgRatingsData } from "@/types";

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
    const ownerId = await getUserIdFromUsername(supabase, username)

    if (!ownerId) redirect("/")

    if (!viewer || viewer.id != ownerId.id) {
        const ownerSettings = await getAccountSettings(supabase, ownerId.id)
        if (!ownerSettings || !ownerSettings.loadout_public) redirect("/")
    }

    const [genreStats, developerStats, statusStats, highlights, ratingsReviews] = await Promise.all([
        getLoadoutGenreStats(supabase, ownerId.id),
        getLoadoutDeveloperStats(supabase, ownerId.id),
        getLoadoutStatusBreakdown(supabase, ownerId.id),
        getLoadoutRatingHighlights(supabase, ownerId.id),
        getUserRatings(supabase, ownerId.id),
    ])

    const completedStat = statusStats.find(s => s.status == "completed")
    const totalGames = statusStats.reduce((acc, s) => { return acc + s.count}, 0)

    const avgRating = ratingsReviews.length > 0 ? ratingsReviews.reduce((acc, r) => { return acc + r.rating}, 0) / ratingsReviews.length : 0
    const ratingDistribution = [10,9,8,7,6,5,4,3,2,1].map(n => ({
        name: n,
        count: ratingsReviews.filter(r => r.rating === n).length
    }))

    const developerMap = await getDeveloperNameMap(supabase, highlights.map(h => h.game_id))
    const avgRatings = await getAvgRatingsForGames(supabase, highlights.map(h => h.game_id)) as AvgRatingsData[]
    const viewerRatings = await getUserRatingsForGames(supabase, viewer?.id ?? "", highlights.map(h => h.game_id))

    // Only sections with something to show get rendered — an empty labelled
    // section reads as broken.
    const genreFavs = genreStats?.filter(g => g.rated_count > 1).slice(0, 6) ?? []
    const developerFavs = developerStats?.filter(d => d.rated_count > 1).slice(0, 6) ?? []
    const topGames = highlights.filter(h => h.highlight_type === "top")
    const bottomGames = highlights.filter(h => h.highlight_type === "bottom")

    let loadoutIdentity = ''
    if (ratingsReviews.length >= 5) {
        loadoutIdentity = await generateLoadoutIdentity({
            username: username,
            totalGames: totalGames,
            completedGames: completedStat ? completedStat.count : 0,
            totalRatings: ratingsReviews.length,
            avgRating,
            topGenres: genreStats ?? [],
            topDevelopers: developerStats ?? []
        })
    }

    return (
        <main className="bg-(--color-bg)">
            <div className="w-full max-w-6xl mx-auto px-6 md:px-10 pt-8 pb-16 font-(family-name:--font-body)">
                <header className="mb-8">
                    <p className="font-mono text-[0.6875rem] uppercase tracking-[0.22em] text-(--color-muted) mb-1">
                        <span className="text-(--color-accent)" aria-hidden="true">&#9656;</span> Stats screen
                    </p>
                    <h1 className="text-4xl md:text-5xl text-(--color-text) font-(family-name:--font-display) mb-2">
                        {username}&apos;s Loadout
                    </h1>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-(--color-muted) tabular-nums">
                        <span><span className="text-(--color-text)">{totalGames}</span> logged</span>
                        <span><span className="text-(--color-text)">{completedStat?.count ?? 0}</span> completed</span>
                        <span><span className="text-(--color-text)">{ratingsReviews.length}</span> rated</span>
                        <span><span className="text-(--color-text)">{ratingsReviews.length ? Math.trunc(avgRating * 100) / 100 : "—"}</span> avg</span>
                    </div>
                </header>

                {/* Analyst's note beside the rating breakdown — two halves of "who is this player" */}
                <div className="grid md:grid-cols-[1.4fr_1fr] gap-8 md:gap-12 mb-14 items-start">
                    {loadoutIdentity ? (
                        <div className="border border-(--color-border) bg-(--color-surface) rounded-md px-7 py-6 shadow-[inset_0_1px_0_rgba(239,232,215,0.05)]">
                            <p className="text-[10px] tracking-[0.3em] uppercase text-(--color-accent) font-mono mb-3">
                                The Read-out
                            </p>
                            <p className="text-lg leading-relaxed text-(--color-text) font-(family-name:--font-display) italic">
                                &ldquo;{loadoutIdentity}&rdquo;
                            </p>
                            <div className="mt-4 flex justify-end">
                                <SubmitBioButton userId={ownerId.id} bio={loadoutIdentity} />
                            </div>
                        </div>
                    ) : (
                        <div className="border border-(--color-border) bg-(--color-surface) rounded-[3px] p-6">
                            <p className="text-[10px] tracking-[0.3em] uppercase text-(--color-muted) font-mono mb-2">
                                Read-out locked
                            </p>
                            <p className="text-(--color-text) mb-4">
                                {`Rate ${Math.max(0, 5 - ratingsReviews.length)} more ${5 - ratingsReviews.length === 1 ? "game" : "games"} to unlock your read-out.`}
                            </p>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="flex-1 h-1.5 bg-(--color-surface-light) rounded-full overflow-hidden">
                                    <div className="h-full bg-(--color-accent) rounded-full" style={{ width: `${Math.min(100, (ratingsReviews.length / 5) * 100)}%` }} />
                                </div>
                                <span className="font-mono text-xs text-(--color-muted) tabular-nums">{Math.min(ratingsReviews.length, 5)} / 5</span>
                            </div>
                            <Link href="/games" className="inline-block px-4 py-2 rounded-[3px] text-sm font-semibold bg-(--color-accent) text-(--color-bg) hover:bg-(--color-accent-hover) transition-colors duration-200">
                                Find games to rate
                            </Link>
                        </div>
                    )}

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