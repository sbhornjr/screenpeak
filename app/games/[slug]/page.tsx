import { createClient } from "@/lib/supabase-server";
import { notFound } from "next/navigation";
import Image from 'next/image'
import Link from 'next/link'
import ScreenshotCarousel from "@/app/components/game/ScreenshotCarousel";
import LibraryButton from "@/app/components/library/LibraryButton";
import RateReviewButton from "@/app/components/game/RateReviewButton";
import GameReviewsFilters from "@/app/components/game/GameReviewsFilters";
import Pagination from "@/app/components/util/Pagination";
import StatCompare from "@/app/components/game/StatCompare";
import StickyGameActions from "@/app/components/game/StickyGameActions";
import AddToListButton from "@/app/components/lists/AddToListButton";
import Avatar from "@/app/components/user/Avatar";
import ExpandableText from "@/app/components/util/ExpandableText";
import SectionHead from "@/app/components/util/SectionHead";
import Panel from "@/app/components/util/Panel";
import { ListSummary, GameRatingsStats } from "@/types";
import { getViewer, getAccountSettings } from "@/lib/queries/user";
import { getGameBySlug, getGameTaxonomy } from "@/lib/queries/game";
import { getGameRatingsStats, getUserRatingReviewForGame, getGameReviewsForPage } from "@/lib/queries/review";
import { getUserLists, getGameListMembership } from "@/lib/queries/list";
import { getLibraryEntry } from "@/lib/queries/library";
import { Metadata } from "next";

type GamePageProps = {
    params: Promise<{ slug: string }>
    searchParams: Promise<{ page?: string, pageSize?: string, sort?: string, order?: string }>
}

function relTime(iso: string) {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
    if (days < 1) return "today"
    if (days < 7) return `${days}d ago`
    if (days < 60) return `${Math.floor(days / 7)}w ago`
    if (days < 365) return `${Math.floor(days / 30)}mo ago`
    return `${Math.floor(days / 365)}y ago`
}

function tierInk(n: number) {
    return n >= 8 ? "var(--color-good)" : n >= 6 ? "var(--color-mid)" : "var(--color-bad)"
}

type LogRow = {
    rating: number
    review: string
    user_id: string
    created_at: string
    users: { username: string, avatar_url: string }
}

const label = "font-mono text-[0.5625rem] uppercase tracking-[0.2em] text-(--color-muted)"
const metaLink = "text-sm text-(--color-text) underline decoration-(--color-border) underline-offset-2 hover:decoration-(--color-accent) hover:text-(--color-accent) transition-colors duration-200"
const tag = "inline-flex px-2 py-0.5 rounded text-[0.6875rem] font-mono tracking-[0.06em] border border-(--color-border) text-(--color-muted) hover:text-(--color-accent) hover:border-(--color-border-bright) transition-colors duration-200"

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const { slug } = await params
    const supabase = await createClient()
    const game = await getGameBySlug(supabase, slug)
    if (!game) return {}
    return {
        title: game.name,
        description: game.description_short ?? `Ratings and reviews for ${game.name} on ScreenPeak.`,
        openGraph: {
            title: game.name,
            images: game.cover_image_url ? [game.cover_image_url] : [],
        },
    }
}

function Log({ row, own = false }: { row: LogRow, own?: boolean }) {
    return (
        <Panel className="px-4 pt-[0.95rem] pb-4">
            <div className="flex items-center gap-2.5 flex-wrap pb-2.5 mb-2.5 border-b border-(--color-border)">
                <Avatar src={row.users?.avatar_url} alt={row.users?.username ?? "user"} size="sm" bordered />
                <Link href={`/user/${row.users?.username}`} className="text-sm font-semibold text-(--color-text) hover:text-(--color-accent) transition-colors duration-200">
                    {own ? "You" : row.users?.username}
                </Link>
                <span className="font-mono text-[0.5625rem] uppercase tracking-[0.13em] text-(--color-muted)">{relTime(row.created_at)}</span>
                <span className="ml-auto font-mono text-[0.8125rem] font-bold" style={{ color: tierInk(row.rating) }}>
                    {row.rating}<span className="text-(--color-muted) font-normal text-[0.7em]"> / 10</span>
                </span>
            </div>
            {row.review
                ? <p className="text-[0.9rem] leading-relaxed text-(--color-text)">&ldquo;{row.review}&rdquo;</p>
                : <p className="text-[0.9rem] italic text-(--color-muted)">Scored it, no note.</p>}
        </Panel>
    )
}

export default async function GamePage({ params, searchParams }: GamePageProps) {
    const { slug } = await params;
    const { page, pageSize, sort, order } = await searchParams;
    const pageQuery = page ? Number(page) : 1
    const pageSizeQuery = pageSize ? Number(pageSize) : 10
    const sortQuery: "date" | "rating" = sort === "rating" ? "rating" : "date"
    const orderQuery: "asc" | "desc" = order === "asc" ? "asc" : "desc"
    const supabase = await createClient()

    const user = await getViewer(supabase)
    const game = await getGameBySlug(supabase, slug)
    if (!game) notFound()

    const {
        genres: genreList,
        platforms: platformList,
        developers: developerList,
        publishers: publisherList,
    } = await getGameTaxonomy(supabase, game.id)

    const stats = await getGameRatingsStats(supabase, game.id)
    const userReview = user ? await getUserRatingReviewForGame(supabase, game.id, user.id) : null
    const libraryEntry = user ? await getLibraryEntry(supabase, user.id, game.id) : null

    const { reviews: pagedReviews, count: otherReviewsCount } = await getGameReviewsForPage(supabase, game.id, {
        limit: pageSizeQuery,
        offset: (pageQuery - 1) * pageSizeQuery,
        sort: sortQuery,
        order: orderQuery,
        excludeUserId: user?.id,
    })
    const otherReviewsTotalPages = Math.ceil(otherReviewsCount / pageSizeQuery)

    const count = stats.total_ratings
    const reviewCount = stats.total_reviews
    const aggregate_rating = stats.avg_rating ?? 0

    const distribution = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(n => ({
        name: n,
        count: stats[`rating_${n}` as keyof GameRatingsStats] as number,
    }))
    const maxCount = Math.max(...distribution.map(d => d.count), 1)

    const lists = user ? (await getUserLists(supabase, user?.id, true)) as ListSummary[] : []
    const listIdsGameIsIn = await getGameListMembership(supabase, game.id, lists.map(l => l.id))
    const userSettings = user ? await getAccountSettings(supabase, user.id) : null

    const year = game.released ? new Date(game.released).getFullYear() : null
    const inFile = !!(userReview || libraryEntry)
    const statusLabel = libraryEntry?.status
        ? libraryEntry.status.charAt(0).toUpperCase() + libraryEntry.status.slice(1)
        : null

    return (
        <main style={{ background: "radial-gradient(120% 55% at 50% -8%, rgba(71,198,221,0.07), transparent 60%), var(--color-bg)" }}>
            <div className="w-full max-w-5xl mx-auto px-6 md:px-10 pt-6 pb-24">

                <div className="flex items-center justify-between mb-8 font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-(--color-muted)">
                    <Link href="/games" className="inline-flex items-center gap-2 hover:text-(--color-accent) transition-colors duration-200 group">
                        <span className="group-hover:-translate-x-0.5 transition-transform duration-200">&#9666;</span>
                        Games
                    </Link>
                    <span className="inline-flex items-center gap-2"><span className="w-[2px] h-[0.8rem] bg-(--color-accent)" aria-hidden="true" /><span className="text-(--color-text)">ScreenPeak</span></span>
                </div>

                <h1
                    className="font-(family-name:--font-display) text-(--color-text) flex items-stretch gap-3 mb-3"
                    style={{ fontSize: "clamp(2.4rem, 5.5vw, 4.5rem)", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 0.97, textWrap: "balance" }}
                >
                    <span className="bg-(--color-accent) shrink-0 self-stretch my-[0.1em]" style={{ width: "3px", flex: "none" }} aria-hidden="true" />
                    <span>{game.name}</span>
                </h1>
                <div className="mb-9 flex flex-wrap items-center gap-1.5">
                    {genreList.map(g => <Link key={g.id} href={`/games?genre=${g.slug}`} className={tag}>{g.name}</Link>)}
                    {game.esrb_rating && <Link href={`/games?esrb=${game.esrb_rating}`} className={tag}>{game.esrb_rating}</Link>}
                    {year && <span className="ml-1 font-mono text-xs text-(--color-muted) tracking-wider">&middot; {year}</span>}
                </div>

                <div className="grid gap-8 md:gap-12 md:grid-cols-[16rem_1fr] items-start">

                    {/* Left rail — cover + your file */}
                    <div className="flex flex-col gap-5 order-2 md:order-1">
                        <div className="rounded-md overflow-hidden border border-(--color-border) shadow-[0_10px_30px_-12px_rgba(0,0,0,0.7)]">
                            <Image src={game.cover_image_url} alt={game.name} width={256} height={340} className="w-full h-auto object-cover" priority />
                        </div>
                        <Panel className="p-4">
                            <p className={`${label} mb-2.5`}>Your save</p>
                            {inFile ? (
                                <ul className="flex flex-col gap-1 text-[0.8125rem]">
                                    {statusLabel && <li className="flex items-baseline gap-2"><span className={label}>Status</span> {statusLabel}</li>}
                                    {userReview?.rating != null && <li className="flex items-baseline gap-2"><span className={label}>Your score</span> {userReview.rating} / 10</li>}
                                    {userReview?.updated_at && <li className="flex items-baseline gap-2"><span className={label}>Scored</span> {relTime(userReview.updated_at)}</li>}
                                    {!statusLabel && !userReview && <li className="text-(--color-muted)">Saved, not scored yet</li>}
                                </ul>
                            ) : (
                                <p className="text-sm text-(--color-muted) leading-relaxed">
                                    Not in your save yet. Hit <span className="text-(--color-accent) font-mono">+ Save Game</span> to add it.
                                </p>
                            )}
                        </Panel>
                    </div>

                    {/* Right — the stats + your move */}
                    <div className="min-w-0 order-1 md:order-2">
                        <SectionHead className="!mt-0">The Scoreboard</SectionHead>
                        <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
                            <StatCompare
                                critic={game.metacritic_score}
                                community={aggregate_rating || null}
                                communityCount={count}
                                you={userReview?.rating ?? null}
                            />
                            <div className="flex flex-col gap-2.5">
                                <p className={label}>Your turn</p>
                                <StickyGameActions gameName={game.name}>
                                    <LibraryButton game_id={game.id} />
                                    <AddToListButton
                                        gameId={game.id}
                                        lists={lists.map(l => ({ listId: String(l.id), listName: l.name, listCount: l.game_count }))}
                                        listIdsGameIsIn={listIdsGameIsIn}
                                        defaultListPrivacy={userSettings?.default_list_public ?? true}
                                    />
                                </StickyGameActions>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Credits — full width so the top grid doesn't leave a tall empty column */}
                <div className="grid gap-x-8 gap-y-4 sm:grid-cols-3 mt-8">
                    <div>
                        <p className={`${label} mb-2`}>Platforms</p>
                        <div className="flex gap-1.5 flex-wrap">
                            {platformList.map(p => <Link key={p.id} href={`/games?platform=${p.slug}`} className={tag}>{p.name}</Link>)}
                        </div>
                    </div>
                    <div>
                        <p className={`${label} mb-1.5`}>Developed by</p>
                        <div className="flex flex-col gap-0.5">
                            {developerList.map(d => <Link key={d.id} href={`/games?developer=${d.slug}`} className={metaLink}>{d.name}</Link>)}
                        </div>
                    </div>
                    <div>
                        <p className={`${label} mb-1.5`}>Published by</p>
                        <div className="flex flex-col gap-0.5">
                            {publisherList.map(p => <Link key={p.id} href={`/games?publisher=${p.slug}`} className={metaLink}>{p.name}</Link>)}
                        </div>
                    </div>
                </div>

                {/* About */}
                {game.description && (
                    <>
                        <SectionHead>About</SectionHead>
                        <div className="mx-auto max-w-3xl">
                            <ExpandableText text={game.description} lines={6} className="text-[0.95rem] leading-relaxed text-(--color-text)" />
                        </div>
                    </>
                )}

                {/* Gallery */}
                {game.screenshots.length > 1 && (
                    <>
                        <SectionHead>Gallery</SectionHead>
                        <div className="mx-auto max-w-3xl">
                            <ScreenshotCarousel screenshots={game.screenshots.slice(1) ?? []} />
                        </div>
                    </>
                )}

                {/* The community */}
                <SectionHead count={count > 0 ? `${count} ${count === 1 ? "score" : "scores"}` : "no scores yet"}>The Community</SectionHead>
                {count > 0 ? (
                    <Panel className="px-5 py-[1.1rem]">
                        <div className="flex items-start justify-between gap-4 mb-3.5">
                            <p className="font-(family-name:--font-display) font-semibold text-[2rem]" style={{ color: "var(--color-community)" }}>
                                {aggregate_rating}<span className="font-mono text-(--color-muted) text-[0.8rem]"> / 10</span>
                            </p>
                            <RateReviewButton game_id={game.id} existing_rating_review={userReview} />
                        </div>
                        {distribution.map(({ name, count: c }) => (
                            <div key={name} className="flex items-center gap-3 py-[0.22rem] font-mono text-xs text-(--color-muted)">
                                <span className="w-5 text-right text-(--color-text) tabular-nums">{name}</span>
                                <div className="flex-1 h-[0.7rem] bg-(--color-surface-light) rounded-sm overflow-hidden">
                                    <div className="h-full rounded-sm" style={{ width: `${(c / maxCount) * 100}%`, minWidth: c > 0 ? "3px" : 0, background: "var(--color-community)" }} />
                                </div>
                                <span className="w-16 tabular-nums">{c > 0 ? `${c} · ${Math.round((c / count) * 100)}%` : "—"}</span>
                            </div>
                        ))}
                    </Panel>
                ) : (
                    <Panel className="px-6 py-[1.3rem]">
                        <p className="text-(--color-text) leading-relaxed max-w-[50ch]">
                            No one on ScreenPeak has scored {game.name} yet. Be the first to put it on the board.
                        </p>
                        <div className="mt-3.5"><RateReviewButton game_id={game.id} existing_rating_review={userReview} /></div>
                    </Panel>
                )}

                {/* Reviews */}
                <SectionHead count={reviewCount}>Reviews</SectionHead>
                {reviewCount > 1 && (
                    <div className="mb-4">
                        <GameReviewsFilters gameSlug={game.slug} pageSize={String(pageSizeQuery)} sort={sortQuery} order={orderQuery} page={String(pageQuery)} />
                    </div>
                )}
                <div className="flex flex-col gap-3">
                    {userReview && user && userReview.review !== "" && <Log row={userReview as unknown as LogRow} own />}
                    {pagedReviews.map(r => <Log key={r.user_id} row={r as unknown as LogRow} />)}
                    {reviewCount === 0 && <p className="text-(--color-muted) italic text-sm">No written reviews yet.</p>}
                </div>
                {otherReviewsCount > 0 && (
                    <div className="mt-5">
                        <Pagination page={pageQuery} maxPages={otherReviewsTotalPages} params={{ pageSize: String(pageSizeQuery), sort: sortQuery, order: orderQuery }} url={`games/${game.slug}`} />
                    </div>
                )}

                {/* Elsewhere */}
                {game.reddit_url && (
                    <>
                        <SectionHead>Elsewhere</SectionHead>
                        <Link href={game.reddit_url} target="_blank" rel="noopener noreferrer" className={`font-mono ${metaLink}`}>
                            r/{game.reddit_url.replace(/https?:\/\/(www\.)?reddit\.com\/r\//, '').replace(/\/$/, '')}
                        </Link>
                    </>
                )}
            </div>
        </main>
    )
}

