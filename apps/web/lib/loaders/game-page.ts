import 'server-only'
import type { GameDetail, GamePageData, GamePageViewer, ViewerListOption } from '@screenpeak/shared/api/games'
import { getGameBySlug, getGameTaxonomy } from '@/lib/queries/game'
import { getGameRatingsStats, getUserRatingReviewForGame } from '@/lib/queries/review'
import { getLibraryEntry } from '@/lib/queries/library'
import { getUserLists, getGameListMembership } from '@/lib/queries/list'
import { getDefaultListPublic } from '@/lib/queries/user'

// The game page's data, for both the website (app/games/[slug]/page.tsx calls
// this directly) and the phone (GET /api/v1/games/[slug] returns it as JSON).
// Typed against the shared contract, so the two can't drift apart.
//
// Reviews are deliberately not here: they're paged by the URL and get their own
// endpoint, so the app can load more without refetching the whole page.

/** `null` when there's no game with this slug. `viewerId` null = signed out. */
export async function loadGamePage(slug: string, viewerId: string | null): Promise<GamePageData | null> {
    const row = await getGameBySlug(slug)
    if (!row) return null

    const [taxonomy, stats, viewer] = await Promise.all([
        getGameTaxonomy(row.id),
        getGameRatingsStats(row.id),
        viewerId ? loadViewerState(row.id, viewerId) : null,
    ])
    return { game: toGameDetail(row), taxonomy, stats, viewer }
}

// Field by field, not the row as-is. Anything the API sends becomes part of
// the payload. TypeScript won't flag extra fields on an existing object, so
// a leftover such as steam_appid would leak silently.
type GameRow = GameDetail & { steam_appid?: number | null }

function toGameDetail(g: GameRow): GameDetail {
    return {
        id: g.id,
        name: g.name,
        slug: g.slug,
        igdb_id: g.igdb_id,
        cover_image_url: g.cover_image_url,
        artwork_image_url: g.artwork_image_url,
        released: g.released,
        description: g.description,
        esrb_rating: g.esrb_rating,
        reddit_url: g.reddit_url,
        screenshots: g.screenshots,
        created_at: g.created_at,
    }
}

// Everything on the page that's specific to the signed-in viewer. Every query is
// scoped to viewerId, so it only ever returns their own rows (their private lists
// included) — nothing here can expose someone else's data.
async function loadViewerState(gameId: string, viewerId: string): Promise<GamePageViewer> {
    const [review, libraryEntry, listRows, defaultListPublic] = await Promise.all([
        getUserRatingReviewForGame(gameId, viewerId),
        getLibraryEntry(viewerId, gameId),
        getUserLists(viewerId, true),
        getDefaultListPublic(viewerId),
    ])

    // get_user_lists is a raw RPC (untyped rows) with far more columns than the
    // "add to list" control needs — send only these three.
    const lists: ViewerListOption[] = (listRows as Record<string, unknown>[]).map(l => ({
        id: String(l.id),
        name: String(l.name),
        game_count: Number(l.game_count),
    }))
    // Needs the list ids, so it waits for the batch above. Returns a Set, which
    // JSON.stringify turns into {} — send an array.
    const membership = await getGameListMembership(gameId, lists.map(l => l.id))

    return {
        review,
        libraryEntry: libraryEntry && {
            id: libraryEntry.id,
            status: libraryEntry.status,
            completed_all_achievements: libraryEntry.completed_all_achievements ?? false,
            // numeric(8,1) arrives from Drizzle as a string ("112.5")
            hours_played: libraryEntry.hours_played == null ? null : Number(libraryEntry.hours_played),
            play_count: libraryEntry.play_count ?? 1,
        },
        lists,
        listIdsGameIsIn: [...membership],
        defaultListPrivacy: defaultListPublic ?? true,
    }
}
