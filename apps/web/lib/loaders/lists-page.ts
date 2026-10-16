import 'server-only'
import type { ListCard, ListsPageData, ListsTab } from '@screenpeak/shared/api/lists'
import type { GameCover } from '@screenpeak/shared/types'
import { getListCoverMap, getListLikes, getLikedLists, getUserLists } from '@/lib/queries/list'
import { getAccountSettings, getProfileSummaryByUsername } from '@/lib/queries/user'
import { cover, int, text } from '@/lib/loaders/shape'

type ListRow = {
    id: unknown
    name: unknown
    description?: unknown
    is_public?: unknown
    is_default?: unknown
    is_pinned?: unknown
    last_activity?: unknown
    game_count?: unknown
    owner_username?: unknown
    owner_id?: unknown
}

/** Null when the username does not exist. Private lists stay off unless this is the owner’s own tab. */
export async function loadUserLists(
    username: string,
    viewerId: string | null,
    tab: ListsTab,
): Promise<ListsPageData | null> {
    const profile = await getProfileSummaryByUsername(username)
    if (!profile) return null

    const isOwner = viewerId === profile.id
    const rows = (tab === 'liked'
        ? await getLikedLists(profile.id)
        : await getUserLists(profile.id, isOwner)) as ListRow[]

    const visible = rows.filter(row => row.is_public || (tab === 'user' && isOwner))
    const ids = visible.map(row => String(row.id))
    const [covers, likes, settings] = await Promise.all([
        ids.length ? getListCoverMap(ids) : Promise.resolve(new Map<string, GameCover[]>()),
        ids.length ? getListLikes(ids) : Promise.resolve([]),
        isOwner ? getAccountSettings(profile.id) : Promise.resolve(null),
    ])

    const lists: ListCard[] = visible.map(row => {
        const id = String(row.id)
        const listLikes = (likes ?? []).filter(like => String(like.list_id) === id)
        return {
            id,
            name: String(row.name ?? ''),
            description: text(row.description) ?? '',
            is_public: !!row.is_public,
            is_pinned: !!row.is_pinned,
            is_default: !!row.is_default,
            last_activity: text(row.last_activity) ?? '',
            game_count: int(row.game_count),
            owner_username: text(row.owner_username) ?? '',
            owner_id: String(row.owner_id ?? ''),
            covers: (covers.get(id) ?? []).map(item => ({
                cover_image_url: cover(item.coverImageUrl, 'small'),
                slug: item.slug,
            })),
            like_count: listLikes.length,
            viewer_has_liked: viewerId != null && listLikes.some(like => like.user_id === viewerId),
        }
    })

    return {
        profile: { id: profile.id, username: profile.username, avatar_url: profile.avatar_url },
        tab,
        default_list_public: isOwner ? (settings?.default_list_public ?? true) : null,
        lists,
    }
}
