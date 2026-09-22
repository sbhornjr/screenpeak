import { createClient } from "@/lib/supabase-server";
import GameCard from "@/app/components/game/GameCard";
import { redirect } from "next/navigation"
import LibraryFilters from "../../../components/library/LibraryFilters";
import Link from "next/link";
import EmptyState from "../../../components/util/EmptyState";
import Eyebrow from "@/app/components/util/Eyebrow";
import { getViewer, getUserIdFromUsername, getAccountSettings } from "@/lib/queries/user";
import { queryGames, getDeveloperNameMap } from "@/lib/queries/game";
import { getLibraryFacets, getLibraryEntries } from "@/lib/queries/library";

type LibraryPageProps = {
    params: Promise<{ username: string }>
    searchParams: Promise<{ q?: string,genre?: string, platform?: string, developer?: string,
        publisher?: string, esrb?: string, sort?: string, order?: string, status?: string, is100?: string }>
}

export default async function LibraryPage({ params, searchParams } : LibraryPageProps) {
    const { q, genre, platform, developer, publisher, esrb, sort, order, status, is100 } = await searchParams;
    const { username } = await params;
    const query = q?.trim() ?? '';
    const genreQuery = genre?.trim() ?? '';
    const platformQuery = platform?.trim() ?? '';
    const developerQuery = developer?.trim() ?? '';
    const publisherQuery = publisher?.trim() ?? '';
    const esrbQuery = esrb?.trim() ?? '';
    const sortQuery = sort?.trim() ?? 'ngplus_rating';
    const orderQuery = order?.trim() ?? 'desc';
    const statusQuery = status?.trim() ?? ''
    const is100Query = is100?.trim() === 'true'
    const supabase = await createClient()

    const viewer = await getViewer(supabase)
    const ownerId = await getUserIdFromUsername(supabase, username)

    if (!ownerId) redirect("/")

    if (!viewer || viewer.id != ownerId.id) {
        const ownerSettings = await getAccountSettings(supabase, ownerId.id)
        if (!ownerSettings || !ownerSettings.library_public) redirect("/")
    }

    const { genres, platforms, developers, publishers, esrbRatings } = await getLibraryFacets(ownerId.id)

    if (genreQuery != '' && !genres.map((g) => g.slug).includes(genreQuery)) {
        redirect('/')
    }

    if (platformQuery != '' && !platforms.map((p) => p.slug).includes(platformQuery)) {
        redirect('/')
    }

    if (developerQuery != '' && !developers.map((d) => d.slug).includes(developerQuery)) {
        redirect('/')
    }

    if (publisherQuery != '' && !publishers.map((p) => p.slug).includes(publisherQuery)) {
        redirect('/')
    }

    if (esrbQuery != '' && !esrbRatings.includes(esrbQuery)) {
        redirect('/')
    }

    const libraryEntries = await getLibraryEntries(ownerId.id, { status: statusQuery, is100: is100Query, sort: sortQuery, order: orderQuery })
    const libraryGameIds = libraryEntries?.map(e => e.game_id) ?? []

    const games = await queryGames({
        q: query || null,
        genre: genreQuery || null,
        platform: platformQuery || null,
        developer: developerQuery || null,
        publisher: publisherQuery || null,
        esrb: esrbQuery || null,
        sort: sortQuery,
        order: orderQuery,
        userId: viewer?.id ?? null,
        gameIds: libraryGameIds,
        limit: 9999
    })

    const finalGameIds = games?.map(g => g.id) ?? []
    const developerMap = await getDeveloperNameMap(finalGameIds)

    return (
        <main>
            <div className="w-full max-w-6xl mx-auto px-6 sm:px-8 pt-8 pb-16">
                <Eyebrow>Save select</Eyebrow>
                <h1 className="text-4xl font-bold font-(family-name:--font-display) tracking-tight mb-6">{username}&apos;s Library</h1>
                {/* Filters */}
                <LibraryFilters
                    current={{query: query, genre: genreQuery, platform: platformQuery, developer: developerQuery, publisher: publisherQuery,
                        esrb: esrbQuery, sort: sortQuery, order: orderQuery, status: statusQuery, is100: is100Query ? 'true' : ''}}
                    genres={genres ?? []}
                    platforms={platforms ?? []}
                    developers={developers ?? []}
                    publishers={publishers ?? []}
                    esrb_ratings={esrbRatings ?? []}
                    username={username}
                />

                {/* Game grid */}
                {games && games.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {games.map(game => {
                            const entry = libraryEntries?.find(le => le.game_id == String(game.id))
                            return (
                                <GameCard
                                    key={game.id}
                                    game={{ id: String(game.id), name: game.name, slug: game.slug, cover_image_url: game.cover_image_url, metacritic_score: game.metacritic_score, released: game.released }}
                                    developer={developerMap.get(String(game.id))}
                                    userRating={game.user_rating}
                                    ngplusRating={game.avg_ngplus_rating}
                                    libraryStatus={entry?.status}
                                    advancedStats={{ is100: entry?.completed_all_achievements ?? false, hoursPlayed: entry?.hours_played != null ? Number(entry.hours_played) : null, playCount: entry?.play_count ?? 1 }}
                                />
                            )
                        })}
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