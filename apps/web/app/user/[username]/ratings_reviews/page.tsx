import type { Metadata } from "next";
import Rating from "@/app/components/game/ReviewPageRating";
import Review from "@/app/components/game/ReviewPageReview";
import Pagination from "@/app/components/util/Pagination";
import RatingsReviewsFilters from "@/app/components/game/RatingsReviewsFilters";
import { notFound } from "next/navigation";
import Link from "next/link";
import { loadUserReviews } from "@/lib/loaders/user-reviews";
import { parseUserReviewsQueryLenient } from "@/lib/screen-query";
import Eyebrow from "@/app/components/util/Eyebrow";
import EmptyState from "@/app/components/util/EmptyState";
import { ArrowLeft } from "lucide-react"

type RatingsPageProps = {
    params: Promise<{ username: string }>
    searchParams: Promise<{ filter?: string, sort?: string, order?: string, page?: string, pageSize?: string }>
}

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
    const { username } = await params
    return {
        title: `${username}'s Ratings & Reviews`,
        description: `Every game ${username} has rated and reviewed on ScreenPeak.`,
    }
}

export default async function RatingsPage({ params, searchParams }: RatingsPageProps) {
    const { username } = await params;
    const raw = await searchParams
    const query = parseUserReviewsQueryLenient(raw)
    let data
    try {
        data = await loadUserReviews(username, query)
    } catch {
        return (
            <main>
                <div className="w-full max-w-4xl mx-auto px-6 sm:px-8 pt-8 pb-16">
                    <EmptyState title="Couldn't load these ratings" description="Try again in a moment." />
                </div>
            </main>
        )
    }
    if (!data) notFound()

    const { filter: filterValue, sort: sortValue, order: orderValue, page: currentPage, pageSize: currentPageSize } = query
    const ratingsReviews = data.items
    const ratingsReviewsCounts = data.counts
    const totalCount = data.total
    const totalPages = data.total_pages

    return (
        <main>
            <div className="w-full max-w-4xl mx-auto px-6 sm:px-8 pt-8 pb-16 flex flex-col gap-2">
                <Link href={`/user/${username}`} className="inline-flex items-center gap-2 text-(--color-muted)
                    text-sm font-semibold mb-6 hover:text-(--color-accent) transition-colors duration-200 font-(family-name:--font-display)">
                    <ArrowLeft size={16} aria-hidden />
                    {username}&apos;s profile
                </Link>
                <Eyebrow>All reviews</Eyebrow>
                <h1 className="text-4xl md:text-5xl font-bold font-(family-name:--font-display) tracking-tight mb-2">{username}&apos;s Ratings &amp; Reviews</h1>
                <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-sm text-(--color-muted) font-mono mb-6">
                    <span className="tabular-nums"><span className="text-(--color-text)">{ratingsReviewsCounts.rating_count}</span> ratings</span>
                    <span className="text-(--color-border)">/</span>
                    <span className="tabular-nums"><span className="text-(--color-text)">{ratingsReviewsCounts.review_count}</span> reviews</span>
                    <span className="text-(--color-border)">/</span>
                    <span className="tabular-nums"><span className="text-(--color-text)">{ratingsReviewsCounts.total_count}</span> total</span>
                </div>
                {ratingsReviews && ratingsReviews.length > 0 ? (
                    <div className="flex flex-col gap-4 w-full mb-4">
                        <RatingsReviewsFilters username={username} filter={filterValue} page={String(currentPage)} pageSize={String(currentPageSize)} sort={sortValue} order={orderValue} />
                        {ratingsReviews.map(rr => (
                            rr.review == "" ? (
                                <Rating key={rr.game_id} slug={rr.game_slug} name={rr.game_name} cover={rr.cover_image_url ?? ''} developer={rr.developer} released={rr.released ?? ''} rating={rr.rating} createdAt={rr.updated_at} />
                            ) : (
                                <Review key={rr.game_id} slug={rr.game_slug} name={rr.game_name} cover={rr.cover_image_url ?? ''} developer={rr.developer} released={rr.released ?? ''} rating={rr.rating} review={rr.review} createdAt={rr.updated_at} />
                            )
                        ))}
                    </div>
                ) : (
                    <div>
                    </div>
                )}
                {!!totalCount && totalCount > 0 && 
                    <Pagination 
                        page={currentPage}
                        maxPages={totalPages}
                        params={{ filter: filterValue, sort: sortValue, order: orderValue, page: String(currentPage), pageSize: String(currentPageSize) }}
                        url={`user/${username}/ratings_reviews`}
                    />
                }
            </div>
        </main>
    )

}