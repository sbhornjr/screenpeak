import type { SupabaseClient } from '@supabase/supabase-js'

export async function getViewer(supabase: SupabaseClient) {
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

export async function getProfileSummaryByUsername(supabase: SupabaseClient, username: string) {
    const { data } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url')
        .eq('username', username)
        .single()

    return data
}

export async function getProfileSummaryById(supabase: SupabaseClient, userId: string) {
    const { data } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url')
        .eq('id', userId)
        .single()

    return data
}

export async function getFullProfile(supabase: SupabaseClient, username: string) {
    const { data } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url, created_at, selected_title, favorite_game_ids, user_bio, default_list_public, library_public, loadout_public, profile_loadout_bio')
        .eq('username', username)
        .single()

    return data
}

export async function getUserIdFromUsername(supabase: SupabaseClient, username: string) {
    const { data } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .single()

    return data
}

export async function getAccountSettings(supabase: SupabaseClient, userId: string) {
    const { data } = await supabase
        .from('users')
        .select('id, username, avatar_url, selected_title, created_at, default_list_public, library_public, loadout_public')
        .eq('id', userId)
        .single()

    return data
}

export async function updateBio(supabase: SupabaseClient, userId: string, bio: string) {
    await supabase.from('users').update({ user_bio: bio }).eq('id', userId)
}

export async function updateUsername(supabase: SupabaseClient, userId: string, username: string) {
    const { data } = await supabase
        .from('users')
        .update({ username })
        .eq('id', userId)
        .select('username')
        .single()

    return data
}

export async function updateSelectedTitle(supabase: SupabaseClient, userId: string, title: string) {
    const { data } = await supabase
        .from('users')
        .update({ selected_title: title })
        .eq('id', userId)
        .select('selected_title')
        .single()

    return data?.selected_title
}

export async function updateFavoriteGames(supabase: SupabaseClient, userId: string, gameIds: string[]) {
    await supabase
        .from('users')
        .update({ favorite_game_ids: gameIds })
        .eq('id', userId)
        .select('favorite_game_ids')
        .single()
}

export async function uploadAvatarImage(supabase: SupabaseClient, userId: string, file: File): Promise<string> {
    const filePath = `${userId}/avatar.${file.name.split('.').pop()}`

    const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true })

    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

    return publicUrl
}

export async function updateAvatarUrl(supabase: SupabaseClient, userId: string, url: string) {
    const { error } = await supabase
        .from('users')
        .update({ avatar_url: url })
        .eq('id', userId)

    return error
}

export async function signInWithPassword(supabase: SupabaseClient, email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error
}

export async function signUpWithPassword(supabase: SupabaseClient, { email, password, username }: { email: string, password: string, username: string }) {
    const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } }
    })
    return error
}

export async function signOut(supabase: SupabaseClient) {
    await supabase.auth.signOut()
}

export async function updateEmail(supabase: SupabaseClient, email: string) {
    const { error } = await supabase.auth.updateUser({ email })
    return error
}

export async function updatePassword(supabase: SupabaseClient, password: string) {
    const { error } = await supabase.auth.updateUser({ password })
    return error
}

export async function updatePrivacy(supabase: SupabaseClient, privacy: boolean, type: string, userId: string) {
    if (type === "Default List") {
        const { error } = await supabase
            .from("users")
            .update({ default_list_public: privacy})
            .eq("id", userId)
        return error
    } else if (type === "Library") {
        const { error } = await supabase
            .from("users")
            .update({ library_public : privacy})
            .eq("id", userId)
        return error
    } else if (type == "Loadout") {
        const { error } = await supabase
            .from("users")
            .update({ loadout_public : privacy})
            .eq("id", userId)
        return error
    }
}

export async function getFollowers(supabase: SupabaseClient, userId: string) {
    const { data } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('following_id', userId)

    return data ?? []
}

export async function getFollowing(supabase: SupabaseClient, userId: string) {
    const { data } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', userId)

    return data ?? []
}

export async function followUser(supabase: SupabaseClient, followerId: string, followingId: string) {
    await supabase.from('follows').insert({ follower_id: followerId, following_id: followingId })
}

export async function unfollowUser(supabase: SupabaseClient, followerId: string, followingId: string) {
    await supabase
        .from('follows')
        .delete()
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
}

export async function deleteUserAccount(adminClient: SupabaseClient, userId: string) {
    const { error } = await adminClient.auth.admin.deleteUser(userId)
    return error
}

export async function getCurrentLoadoutIdentity(supabase: SupabaseClient, userId: string) {
    const { data } = await supabase
        .from("users")
        .select("loadout_identity, loadout_identity_at")
        .eq("id", userId)
        .single()

    return data
        
}
