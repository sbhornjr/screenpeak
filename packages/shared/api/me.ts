// GET /api/v1/me — the signed-in player's card, or `{ user: null }` when signed out.
// GET /api/v1/me/settings — account settings. 401 when signed out. No Steam id.

export type MeData = {
    user: {
        id: string
        username: string
        display_name: string | null
        avatar_url: string | null
        selected_title: string | null
    } | null
}

export type SettingsData = {
    username: string
    avatar_url: string | null
    selected_title: string | null
    created_at: string | null
    email: string | null
    default_list_public: boolean
    library_public: boolean
    loadout_public: boolean
    steam_linked: boolean
}
