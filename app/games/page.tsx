import { createClient } from "@/lib/supabase-server";
import GameCard from "@/app/components/game/GameCard";
import GameFilters from "../components/game/GameFilters";
import Link from "next/link";
import Pagination from "../components/util/Pagination";
import EmptyState from "../components/util/EmptyState";
import { getViewer } from "@/lib/queries/user-auth";
import { queryGames, getAllGenres, getAllPlatforms, getDistinctEsrbRatings, getDeveloperNameMap } from "@/lib/queries/game";

type SearchPageProps = {
    searchParams: Promise<{ q?: string, genre?: string, platform?: string, developer?: string, publisher?: string, esrb?: string, page?: number, pageSize?: string, sort?: string, order?: string }>
}

export default async function SearchPage({ searchParams } : SearchPageProps) {
    const { q, genre, platform, developer, publisher, esrb, page, pageSize, sort, order } = await searchParams;
    const query = q?.trim() ?? '';
    const genreQuery = genre?.trim() ?? '';
    const platformQuery = platform?.trim() ?? '';
    const developerQuery = developer?.trim() ?? '';
    const publisherQuery = publisher?.trim() ?? '';
    const pageQuery = page ? Number(page) : 1
    const pageSizeQuery = pageSize ? Number(pageSize) : 10
    const sortQuery = sort?.trim() || 'ngplus_rating';
    const orderQuery = order?.trim() ?? "desc";
    const esrbQuery = esrb?.trim() ?? '';
    const supabase = await createClient()

    const user = await getViewer(supabase)

    const games = await queryGames({
        q: query || null,
        genre: genreQuery || null,
        platform: platformQuery || null,
        developer: developerQuery || null,
        publisher: publisherQuery || null,
        esrb: esrbQuery || null,
        sort: sortQuery,
        order: orderQuery,
        limit: pageSizeQuery,
        offset: (pageQuery - 1) * pageSizeQuery,
        userId: user ? user.id : null,
        gameIds: null
    })

    const totalCount = games[0]?.total_count ?? 0
    const totalPages = Math.ceil(totalCount / pageSizeQuery)

    const genres = await getAllGenres()
    const platforms = await getAllPlatforms()
    const esrb_ratings = await getDistinctEsrbRatings()

    const finalGameIds = games?.map(g => g.id) ?? []
    const developerMap = await getDeveloperNameMap(finalGameIds)

    return (
        <main>
            <div className="w-full max-w-6xl mx-auto px-6 sm:px-8 pt-8 pb-16">
                <h1 className="text-4xl font-bold font-(family-name:--font-display) tracking-tight mb-6">
                    Games
                </h1>
                {/* Filters */}
                <GameFilters
                    current={{query: query, genre: genreQuery, platform: platformQuery, developer: developerQuery, publisher: publisherQuery, esrb: esrbQuery, pageSize: String(pageSizeQuery), order: orderQuery, sort: sortQuery}}
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
                                game={{ id: String(game.id), name: game.name, slug: game.slug, cover_image_url: game.cover_image_url, metacritic_score: game.metacritic_score, released: game.released }} 
                                developer={developerMap.get(String(game.id))}
                                userRating={game.user_rating} 
                                ngplusRating={game.avg_ngplus_rating}
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
                        params={{ q: query, genre: genreQuery, platform: platformQuery, developer: developerQuery, publisher: publisherQuery, esrb: esrbQuery, pageSize: String(pageSizeQuery), sort: sortQuery, order: orderQuery }}
                        url="games"
                    />
                }
            </div>
        </main>
    )
}