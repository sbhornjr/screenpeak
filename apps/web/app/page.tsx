import { createClient } from "@/lib/supabase-server";
import FeedList from "@/app/components/feed/FeedList";
import FeedReview from "@/app/components/feed/FeedReview";
import GameCard from "@/app/components/game/GameCard";
import Seal from "@/app/components/game/Seal";
import Avatar from "@/app/components/user/Avatar";
import LandingCTA from "@/app/components/util/LandingCTA";
import EmptyState from "@/app/components/util/EmptyState";
import StatCompare from "@/app/components/game/StatCompare";
import Eyebrow from "@/app/components/util/Eyebrow";
import Image from "next/image";
import Link from "next/link";
import { getViewer } from "@/lib/queries/user-auth";
import { getFeed } from "@/lib/queries/feed";
import { FEED_PAGE_SIZE } from "@screenpeak/shared/constants";
import { getHeroGame } from "@/lib/queries/game";
import { getTrendingGames } from "@/lib/queries/explore";
import { getRecentReviewsGlobal } from "@/lib/queries/review";
import { tierColor } from "@/lib/rating-tier";
import { parseDbTimestamp } from "@/lib/dates";
import { getFeaturedLoadout } from "@/lib/queries/user";

// Whose real, saved Loadout the logged-out landing page shows as its sample.
const FEATURED_LOADOUT_USERNAME = "hornflakes"

export default async function Home() {
    const supabase = await createClient()

    const viewer = await getViewer(supabase)

    if (!viewer) {
        const [heroGame, trendingGames, recentReviews, featuredLoadout] = await Promise.all([
            getHeroGame(),
            getTrendingGames(null, 30),
            getRecentReviewsGlobal(3),
            getFeaturedLoadout(FEATURED_LOADOUT_USERNAME),
        ])

        return (
            <main>
                {/* Hero — the tri-source rating tension, made concrete with a real game */}
                <section className={`w-full max-w-6xl mx-auto px-6 pt-16 pb-20 grid grid-cols-1 gap-12 items-center ${heroGame ? "md:grid-cols-2" : ""}`}>
                    <div>
                        <Eyebrow className="!mb-4">{heroGame ? heroGame.name : 'Every game, three scores'}</Eyebrow>
                        {heroGame ? (
                            <h1 className="text-4xl sm:text-5xl md:text-6xl font-(family-name:--font-display) text-(--color-text) leading-[1.1] mb-6">
                                Metacritic said <span style={{ color: tierColor(heroGame.metacritic_score, 100) }}>{heroGame.metacritic_score}</span>.
                                {' '}ScreenPeak said <span style={{ color: tierColor(heroGame.avg_ngplus_rating) }}>{heroGame.avg_ngplus_rating}</span>.
                            </h1>
                        ) : (
                            <h1 className="text-4xl sm:text-5xl md:text-6xl font-(family-name:--font-display) text-(--color-text) leading-[1.1] mb-6">
                                Every game gets three scores.
                            </h1>
                        )}
                        <p className="text-lg text-(--color-muted) mb-5 font-(family-name:--font-display) italic">
                            What do you say?
                        </p>
                        {heroGame && (
                            <div className="mb-6">
                                <StatCompare
                                    critic={heroGame.metacritic_score}
                                    community={heroGame.avg_ngplus_rating}
                                    communityCount={heroGame.rating_count}
                                    you={null}
                                />
                            </div>
                        )}
                        <p className="text-(--color-muted) mb-8 max-w-md leading-relaxed">
                            ScreenPeak stamps every game you log with three scores: the critics&apos; verdict, the community&apos;s, and yours. Track your library, rate what you&apos;ve played, and see where you land.
                        </p>
                        <LandingCTA primaryLabel="Start Your Library" />
                    </div>
                    {heroGame && (
                        <div className="relative aspect-3/4 w-full max-w-sm mx-auto rounded-[3px] overflow-hidden
                            border border-(--color-border) shadow-[0_20px_50px_rgba(0,0,0,0.5)] -rotate-2">
                            <Image
                                src={heroGame.cover_image_url}
                                alt={heroGame.name}
                                fill
                                className="object-cover"
                                sizes="(max-width: 768px) 80vw, 400px"
                                priority
                            />
                            <Seal label="MC" score={heroGame.metacritic_score} side="right" scale={100} />
                            <Seal label="SP" score={heroGame.avg_ngplus_rating} side="left" />
                        </div>
                    )}
                </section>

                {/* Proof strip — real activity, not marketing copy */}
                <section className="w-full max-w-6xl mx-auto px-6 pb-20">
                    <Eyebrow className="!mb-2">Peak right now</Eyebrow>
                    <h2 className="text-3xl font-(family-name:--font-display) text-(--color-text) mb-8">
                        Real ratings from real players
                    </h2>

                    {recentReviews.length > 0 && (
                        <ol className="max-w-6xl mb-14 border-y border-(--color-border) divide-y divide-(--color-border)">
                            {recentReviews.map(r => (
                                <li key={`${r.user_id}-${r.games.slug}`} className="py-4">
                                    <div className="flex items-center gap-2 px-3 mb-1">
                                        <Avatar src={r.users.avatar_url} alt={r.users.username} size="sm" bordered />
                                        <p className="text-sm text-(--color-muted) flex-1 min-w-0 truncate">
                                            <Link href={`/user/${r.users.username}`}
                                                className="text-(--color-text) font-semibold hover:text-(--color-accent) transition-colors duration-200">
                                                {r.users.username}
                                            </Link>
                                            {' '}reviewed {r.games.name}
                                        </p>
                                        <time dateTime={parseDbTimestamp(r.created_at).toISOString()}
                                            className="shrink-0 text-xs text-(--color-muted) font-mono">
                                            {parseDbTimestamp(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </time>
                                    </div>
                                    <FeedReview
                                        gameSlug={r.games.slug}
                                        gameName={r.games.name}
                                        gameCoverImageUrl={r.games.cover_image_url}
                                        rating={r.rating}
                                        review={r.review}
                                    />
                                </li>
                            ))}
                        </ol>
                    )}

                    {trendingGames.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-6">
                            {trendingGames.slice(0, 5).map(game => (
                                <GameCard
                                    key={game.game_id}
                                    game={{ id: game.game_id, name: game.game_name, slug: game.game_slug, cover_image_url: game.game_cover_image_url, metacritic_score: game.metacritic_score, released: game.game_released }}
                                    developer={game.game_developer}
                                    ngplusRating={game.avg_rating}
                                    userRating={null}
                                />
                            ))}
                        </div>
                    )}
                </section>

                {/* Loadout teaser — the single most ownable feature, made tangible */}
                <section className="w-full max-w-3xl mx-auto px-6 pb-24 text-center">
                    <Eyebrow className="justify-center !mb-2">Your turn</Eyebrow>
                    <h2 className="text-3xl font-(family-name:--font-display) text-(--color-text) mb-8">
                        Rate five games. We&apos;ll tell you who you are.
                    </h2>
                    {featuredLoadout && (
                        <figure className="text-left max-w-xl mx-auto mb-10 border border-(--color-border) bg-(--color-surface) rounded-[3px] px-7 py-6">
                            <Eyebrow className="!text-[10px] !mb-3">A real read-out</Eyebrow>
                            <blockquote className="text-lg leading-relaxed text-(--color-text) font-(family-name:--font-body) italic">
                                &ldquo;{featuredLoadout.loadout_identity}&rdquo;
                            </blockquote>
                            <figcaption className="mt-4 flex items-center gap-2 text-sm text-(--color-muted)">
                                <Avatar src={featuredLoadout.avatar_url} alt={featuredLoadout.username} size="sm" bordered />
                                <span>
                                    <Link href={`/user/${featuredLoadout.username}/loadout`}
                                        className="font-semibold text-(--color-text) hover:text-(--color-accent) transition-colors duration-200">
                                        {featuredLoadout.username}
                                    </Link>
                                    &apos;s Loadout
                                </span>
                            </figcaption>
                        </figure>
                    )}
                    <LandingCTA primaryLabel="Get Your Loadout" className="justify-center" />
                </section>
            </main>
        )
    }

    const feed = await getFeed(viewer?.id, FEED_PAGE_SIZE, 0)

    return (
        <main>
            <div className="w-full max-w-6xl mx-auto px-6 pt-8 pb-16">
                <Eyebrow>Activity log</Eyebrow>
                <h1 className="text-4xl font-bold mb-8 font-(family-name:--font-display) tracking-tight">
                    Activity
                </h1>

                {feed && feed.length > 0 ? (
                    <FeedList initialItems={feed} />
                ) : (
                    <EmptyState
                        title="Your feed is quiet"
                        description="Follow other players and their ratings, reviews, and lists will show up here."
                        actionHref="/explore"
                        actionLabel="Find people to follow"
                    />
                )}
            </div>
        </main>
    )
}
