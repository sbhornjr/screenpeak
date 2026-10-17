import type { Metadata } from "next";
import GameCard from "@/app/components/game/GameCard";
import { redirect } from "next/navigation"
import LibraryFilters from "../../../components/library/LibraryFilters";
import Link from "next/link";
import Eyebrow from "@/app/components/util/Eyebrow";
import { getOptionalUser } from "@/lib/auth";
import { loadUserLibrary } from "@/lib/loaders/library-page";
import { parseLibraryQueryLenient } from "@/lib/screen-query";
import type { LibraryPageData } from "@screenpeak/shared/api/library";
import EmptyState from "../../../components/util/EmptyState";

type LibraryPageProps = {
    params: Promise<{ username: string }>
    searchParams: Promise<{ q?: string,genre?: string, platform?: string, developer?: string,
        publisher?: string, esrb?: string, sort?: string, order?: string, status?: string, is100?: string }>
}

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
    const { username } = await params
    return {
        title: `${username}'s Library`,
        description: `Every game in ${username}'s library on ScreenPeak: playing, completed, backlog, and abandoned.`,
    }
}

const EMPTY_LIBRARY = (username: string): LibraryPageData => ({
    username,
    facets: { genres: [], platforms: [], developers: [], publishers: [], esrb_ratings: [] },
    games: [],
})

export default async function LibraryPage({ params, searchParams } : LibraryPageProps) {
    const raw = await searchParams;
    const { username } = await params;
    const query = parseLibraryQueryLenient(raw)
    if (!query) {
        return (
            <main>
                <div className="w-full max-w-6xl mx-auto px-6 sm:px-8 pt-8 pb-16">
                    <Eyebrow>Save select</Eyebrow>
                    <h1 className="text-4xl font-bold font-(family-name:--font-display) tracking-tight mb-6">{username}&apos;s Library</h1>
                    <EmptyState
                        title="That status is not a library filter"
                        description="Playing, completed, backlog, and abandoned are the statuses a library can show."
                    />
                </div>
            </main>
        )
    }
    const viewer = await getOptionalUser()
    let library: LibraryPageData | null
    try {
        library = await loadUserLibrary(username, viewer?.id ?? null, query)
    } catch {
        library = EMPTY_LIBRARY(username)
    }

    if (!library) redirect("/")

    const { genres, platforms, developers, publishers, esrb_ratings: esrbRatings } = library.facets
    const genreQuery = query.genre ?? ''
    const platformQuery = query.platform ?? ''
    const developerQuery = query.developer ?? ''
    const publisherQuery = query.publisher ?? ''
    const esrbQuery = query.esrb ?? ''
    const textQuery = query.q ?? ''
    const sortQuery = query.sort
    const orderQuery = query.order
    const statusQuery = query.status
    const is100Query = query.is100

    if (genreQuery != '' && !genres.map((g) => g.slug).includes(genreQuery)) redirect('/')
    if (platformQuery != '' && !platforms.map((p) => p.slug).includes(platformQuery)) redirect('/')
    if (developerQuery != '' && !developers.map((d) => d.slug).includes(developerQuery)) redirect('/')
    if (publisherQuery != '' && !publishers.map((p) => p.slug).includes(publisherQuery)) redirect('/')
    if (esrbQuery != '' && !esrbRatings.includes(esrbQuery)) redirect('/')

    const listedGames = library.games

    return (
        <main>
            <div className="w-full max-w-6xl mx-auto px-6 sm:px-8 pt-8 pb-16">
                <Eyebrow>Save select</Eyebrow>
                <h1 className="text-4xl font-bold font-(family-name:--font-display) tracking-tight mb-6">{username}&apos;s Library</h1>
                {/* Filters */}
                <LibraryFilters
                    current={{query: textQuery, genre: genreQuery, platform: platformQuery, developer: developerQuery, publisher: publisherQuery,
                        esrb: esrbQuery, sort: sortQuery, order: orderQuery, status: statusQuery, is100: is100Query ? 'true' : ''}}
                    genres={genres ?? []}
                    platforms={platforms ?? []}
                    esrb_ratings={esrbRatings ?? []}
                    username={username}
                />

                {/* Game grid */}
                {listedGames && listedGames.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {listedGames.map(game => (
                            <GameCard
                                key={game.id}
                                game={{ id: game.id, name: game.name, slug: game.slug, cover_image_url: game.cover_image_url, released: game.released }}
                                developer={game.developer}
                                userRating={game.user_rating}
                                ngplusRating={game.avg_rating}
                                libraryStatus={game.library_status}
                                advancedStats={{ is100: game.completed_all_achievements, hoursPlayed: game.hours_played, playCount: game.play_count }}
                            />
                        ))}
                    </div>
                ) : (
                    <EmptyState
                        title="No games found"
                        description={<>Try a different search, or browse <Link href="/games" className="text-(--color-accent) hover:underline">all games</Link> and add to your Library.</>}
                        actionHref="/"
                        actionLabel="Back to Home"
                    />
                )}
            </div>
        </main>
    )
}