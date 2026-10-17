import 'server-only'
import type { MeData, SettingsData } from '@screenpeak/shared/api/me'
import { getSteamAccount } from '@/lib/queries/steam'
import { getAccountSettings, getProfileById } from '@/lib/queries/user'
import { text } from '@/lib/loaders/shape'

/** `{ user: null }` when signed out or the profile row is missing. Never includes email. */
export async function loadMe(userId: string | null): Promise<MeData> {
    if (!userId) return { user: null }
    const row = await getProfileById(userId)
    if (!row) return { user: null }
    return {
        user: {
            id: row.id,
            username: row.username,
            display_name: row.display_name,
            avatar_url: row.avatar_url,
            selected_title: row.selected_title,
        },
    }
}

/** Null when the account row is missing. The Steam id stays on the query row. */
export async function loadSettings(user: { id: string; email: string | null }): Promise<SettingsData | null> {
    const [row, steam] = await Promise.all([
        getAccountSettings(user.id),
        getSteamAccount(user.id),
    ])
    if (!row) return null
    return {
        username: row.username,
        avatar_url: row.avatar_url,
        selected_title: row.selected_title,
        created_at: text(row.created_at),
        email: user.email,
        default_list_public: !!row.default_list_public,
        library_public: !!row.library_public,
        loadout_public: !!row.loadout_public,
        steam_linked: steam != null,
    }
}
