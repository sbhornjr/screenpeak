import type { Metadata } from "next"
import GameCard from "../components/game/GameCard"
import GameFilters from "../components/game/GameFilters"
import Link from "next/link"
import Pagination from "../components/util/Pagination"
import EmptyState from "../components/util/EmptyState"
import { getOptionalUser } from "@/lib/auth"
import { loadGamesPage } from "@/lib/loaders/games-page"
import { parseGamesListQueryLenient } from "@/lib/screen-query"
import type { GamesListPage } from "@screenpeak/shared/api/games"

type SearchPageProps = {
    searchParams: Promise<{ q?: string, genre?: string, platform?: string, developer?: string, publisher?: string, esrb?: string, page?: string, pageSize?: string, sort?: string, order?: string }>
}

export const metadata: Metadata = {
    title: "Games",
    description: "Search and filter every game on ScreenPeak by genre, platform, and score.",
}

export default async function SearchPage({ searchParams } : SearchPageProps) {
    const raw = await searchParams
    const query = parseGamesListQueryLenient(raw)
    const user = await getOptionalUser()

    let data: GamesListPage
    try {
        data = await loadGamesPage(query, user?.id ?? null)
    } catch {
        data = { games: [], total: 0, total_pages: 0, genres: [], platforms: [], esrb_ratings: [], filter_names: { developer: null, publisher: null }, viewer: null }
    }

    const { games, total: totalCount, total_pages: totalPages, genres, platforms, esrb_ratings } = data
    const pageQuery = query.page
    const pageSizeQuery = query.pageSize
    const sortQuery = query.sort
    const orderQuery = query.order
    const genreQuery = query.genre ?? ''
    const platformQuery = query.platform ?? ''
    const developerQuery = query.developer ?? ''
    const publisherQuery = query.publisher ?? ''
    const esrbQuery = query.esrb ?? ''
    const textQuery = query.q ?? ''

    return (
        <main>
            <div className="w-full max-w-6xl mx-auto px-6 sm:px-8 pt-8 pb-16">
                <h1 className="text-4xl font-bold font-(family-name:--font-display) tracking-tight mb-6">
                    Games
                </h1>
                {/* Filters */}
                <GameFilters
                    current={{query: textQuery, genre: genreQuery, platform: platformQuery, developer: developerQuery, publisher: publisherQuery, esrb: esrbQuery, pageSize: String(pageSizeQuery), order: orderQuery, sort: sortQuery}}
                    genres={genres}
                    platforms={platforms}
                    esrb_ratings={esrb_ratings}
                />

                {/* Game grid */}
                {games && games.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-10">
                        {games.map(game => (
                            <GameCard
                                key={game.id}
                                game={{ id: game.id, name: game.name, slug: game.slug, cover_image_url: game.cover_image_url, released: game.released }}
                                developer={game.developer}
                                userRating={game.user_rating}
                                ngplusRating={game.avg_rating}
                            />
                        ))}
                    </div>
                ) : (
                    <EmptyState
                        title="No games found"
                        description={<>Try a different search, or browse <Link href="/games" className="text-(--color-accent) hover:underline">our library</Link>.</>}
                        actionHref="/"
                        actionLabel="Back to Home"
                    />
                )}

                {!!totalCount && totalCount > 0 && 
                    <Pagination 
                        page={pageQuery}
                        maxPages={totalPages}
                        params={{ q: textQuery, genre: genreQuery, platform: platformQuery, developer: developerQuery, publisher: publisherQuery, esrb: esrbQuery, pageSize: String(pageSizeQuery), sort: sortQuery, order: orderQuery }}
                        url="games"
                    />
                }
            </div>
        </main>
    )
}