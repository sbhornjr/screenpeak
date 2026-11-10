import FeedList from "@/app/components/feed/FeedList"
import FeedReview from "@/app/components/feed/FeedReview"
import GameCard from "@/app/components/game/GameCard"
import Seal from "@/app/components/game/Seal"
import Avatar from "@/app/components/user/Avatar"
import LandingCTA from "@/app/components/util/LandingCTA"
import EmptyState from "@/app/components/util/EmptyState"
import StatCompare from "@/app/components/game/StatCompare"
import Eyebrow from "@/app/components/util/Eyebrow"
import Image from "next/image"
import Link from "next/link"
import { getOptionalUser } from "@/lib/auth"
import { loadFeed } from "@/lib/loaders/feed"
import { loadHomeLanding } from "@/lib/loaders/home"
import { parseDbTimestamp } from "@screenpeak/shared/dates"
import { FEED_EMPTY } from "@screenpeak/shared/feed-copy"
import { resolveHeroVisual } from "@/lib/catalog/images"

export default async function Home() {

    const viewer = await getOptionalUser()

    if (!viewer) {
        const landing = await loadHomeLanding()
        const heroGame = landing.hero
        const trendingGames = landing.trending_games
        const recentReviews = landing.recent_reviews
        const featuredLoadout = landing.featured_loadout

        const heroVisual = heroGame ? await resolveHeroVisual(heroGame) : null

        return (
            <main>
                <section className={`w-full max-w-6xl mx-auto px-6 pt-16 pb-20 grid grid-cols-1 gap-12 items-center ${heroVisual ? "md:grid-cols-2" : ""}`}>
                    <div>
                        <Eyebrow className="!mb-4">{heroGame ? heroGame.name : 'ScreenPeak'}</Eyebrow>
                        <h1 className="text-4xl sm:text-5xl md:text-6xl font-(family-name:--font-display) text-(--color-text) leading-[1.1] mb-6">
                            Your games. Your take.
                        </h1>
                        {heroGame && (
                            <div className="mb-6">
                                <StatCompare
                                    signedIn={false}
                                    you={null}
                                    community={heroGame.avg_rating}
                                    communityCount={heroGame.rating_count}
                                />
                            </div>
                        )}
                        <p className="text-(--color-muted) mb-8 max-w-md leading-relaxed">
                            Track what you play, rate your games, and see how your take compares with the community.
                        </p>
                        <LandingCTA primaryLabel="Start Your Library" />
                    </div>
                    {heroVisual && heroGame && (
                        <div className={`relative w-full mx-auto rounded-[3px] overflow-hidden
                            border border-(--color-border) shadow-[0_20px_50px_rgba(0,0,0,0.5)] -rotate-2
                            ${heroVisual.frame === "landscape" ? "aspect-video max-w-xl" : "aspect-3/4 max-w-sm"}`}>
                            <Image
                                src={heroVisual.url}
                                alt={heroGame.name}
                                fill
                                className="object-cover"
                                sizes="(max-width: 768px) 80vw, 640px"
                                priority
                            />
                            <Seal label="SP" score={heroGame.avg_rating} side="right" />
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
                            {trendingGames.map(game => (
                                <GameCard
                                    key={game.id}
                                    game={{ id: game.id, name: game.name, slug: game.slug, cover_image_url: game.cover_image_url, released: game.released }}
                                    developer={game.developer}
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

    let feed: Awaited<ReturnType<typeof loadFeed>>['items'] = []
    try {
        feed = (await loadFeed(viewer.id, 0)).items
    } catch {
        feed = []
    }

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
                        title={FEED_EMPTY.title}
                        description={FEED_EMPTY.description}
                        actionHref="/explore"
                        actionLabel={FEED_EMPTY.actionLabel}
                    />
                )}
            </div>
        </main>
    )
}
