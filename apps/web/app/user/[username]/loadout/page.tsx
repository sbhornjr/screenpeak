import type { Metadata } from "next"
import GameCard from "@/app/components/game/GameCard"
import Link from "next/link"
import { redirect } from "next/navigation"
import LoadoutActions from "@/app/components/user/LoadoutActions"
import DistributionChart from "@/app/components/util/DistributionChart"
import SectionHead from "@/app/components/util/SectionHead"
import Eyebrow from "@/app/components/util/Eyebrow"
import { panelClass } from "@/app/components/util/Panel"
import EmptyState from "@/app/components/util/EmptyState"
import { getOptionalUser } from "@/lib/auth"
import { loadLoadoutPage } from "@/lib/loaders/loadout-page"
import { tierColor } from "@/lib/rating-tier"

type LoadoutPageProps = {
    params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
    const { username } = await params
    return {
        title: `${username}'s Loadout`,
        description: `${username}'s gamer identity on ScreenPeak: favorite genres, developers, and how they rate.`,
    }
}

export default async function LoadoutPage({ params } : LoadoutPageProps) {
    const { username } = await params
    
    const viewer = await getOptionalUser()
    let data
    try {
        data = await loadLoadoutPage(username, viewer?.id ?? null)
    } catch {
        return (
            <main className="bg-(--color-bg)">
                <div className="w-full max-w-6xl mx-auto px-6 md:px-10 pt-8 pb-16">
                    <EmptyState title="Couldn't load this Loadout" description="Try again in a moment." />
                </div>
            </main>
        )
    }
    if (!data) redirect("/")

    const totalGames = data.total_games
    const completedStat = data.completed_games
    const avgRating = data.avg_rating
    const ratingCount = data.rating_count
    const ratingDistribution = data.distribution.map(row => ({ name: row.rating, count: row.count }))
    const genreFavs = data.genres
    const developerFavs = data.developers
    const topGames = data.top_games
    const bottomGames = data.bottom_games
    const isOwner = data.viewer?.is_owner ?? false
    const loadoutIdentity = data.identity
    const canGenerate = data.can_generate
    const ratingsToUnlock = Math.max(0, 5 - ratingCount)

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
                        <span><span className="text-(--color-text)">{ratingCount}</span> rated</span>
                        <span><span className="text-(--color-text)">{avgRating == null ? "—" : Math.trunc(avgRating * 100) / 100}</span> avg</span>
                    </div>
                </header>

                {/* Analyst's note beside the rating breakdown — two halves of "who is this player" */}
                <div className="grid md:grid-cols-[1.4fr_1fr] gap-8 md:gap-12 mb-14 items-start">
                    <div className={`${panelClass} px-7 py-6`}>
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
                                                <div className="h-full bg-(--color-accent) rounded-full" style={{ width: `${Math.min(100, (ratingCount / 5) * 100)}%` }} />
                                            </div>
                                            <span className="font-mono text-xs text-(--color-muted) tabular-nums">{Math.min(ratingCount, 5)} / 5</span>
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
                            <div key={g.genre_name} className={`${panelClass} p-4 flex flex-col gap-2`}>
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
                            <div key={d.developer_name} className={`${panelClass} p-4 flex flex-col gap-2`}>
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
                                key={h.id}
                                game={{ id: h.id, name: h.name, slug: h.slug, cover_image_url: h.cover_image_url, released: h.released }}
                                developer={h.developer}
                                ngplusRating={h.avg_rating}
                                userRating={h.user_rating}
                            />
                        )}
                    </div>
                </>)}

                {bottomGames.length > 0 && (<>
                <SectionHead>Bottom Scores</SectionHead>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {bottomGames.map(h =>
                            <GameCard
                                key={h.id}
                                game={{ id: h.id, name: h.name, slug: h.slug, cover_image_url: h.cover_image_url, released: h.released }}
                                developer={h.developer}
                                ngplusRating={h.avg_rating}
                                userRating={h.user_rating}
                            />
                        )}
                    </div>
                </>)}
            </div>
        </main>
    )
}