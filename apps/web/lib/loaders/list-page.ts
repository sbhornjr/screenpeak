import 'server-only'
import type { ListPageData } from '@screenpeak/shared/api/lists'
import type { GameCardData } from '@screenpeak/shared/api/games'
import { getDeveloperNameMap } from '@/lib/queries/game'
import { getListById, getListGames, getListLikes } from '@/lib/queries/list'
import { getAvgRatingsForGames, getUserRatingsForGames } from '@/lib/queries/review'
import { getProfileSummaryByUsername } from '@/lib/queries/user'
import { gameCard, text } from '@/lib/loaders/shape'

/** Null when the list is missing, private to this caller, or not owned by `username`. */
export async function loadListPage(
    username: string,
    listId: string,
    viewerId: string | null,
): Promise<ListPageData | null> {
    const profile = await getProfileSummaryByUsername(username)
    if (!profile) return null

    const list = await getListById(listId)
    if (!list || list.user_id !== profile.id) return null
    if (!list.is_public && viewerId !== profile.id) return null

    const entries = await getListGames(list.id)
    const ids = entries.map(entry => entry.games.id)
    const [averages, viewerRatings, developers, likes] = await Promise.all([
        ids.length ? getAvgRatingsForGames(ids) : Promise.resolve([]),
        viewerId && ids.length ? getUserRatingsForGames(viewerId, ids) : Promise.resolve([]),
        ids.length ? getDeveloperNameMap(ids) : Promise.resolve(new Map<string, string | null>()),
        getListLikes([list.id]),
    ])

    const avgById = new Map(averages.map(row => [String(row.game_id), row.avg_rating]))
    const userById = new Map(viewerRatings.map(row => [String(row.game_id), row.rating]))
    const games: GameCardData[] = entries.map(entry => {
        const id = String(entry.games.id)
        return gameCard({
            ...entry.games,
            avg_rating: avgById.get(id) ?? null,
            user_rating: viewerId ? (userById.get(id) ?? null) : null,
        }, developers.get(id) ?? null)
    })

    const likeRows = likes ?? []
    return {
        profile: { id: profile.id, username: profile.username, avatar_url: profile.avatar_url },
        list: {
            id: list.id,
            name: list.name,
            description: text(list.description) ?? '',
            is_public: !!list.is_public,
            is_pinned: !!list.is_pinned,
            is_default: !!list.is_default,
            updated_at: text(list.updated_at) ?? '',
            game_count: games.length,
        },
        like_count: likeRows.length,
        games,
        viewer: viewerId
            ? { is_owner: viewerId === profile.id, has_liked: likeRows.some(like => like.user_id === viewerId) }
            : null,
    }
}
