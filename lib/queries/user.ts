import type { SupabaseClient } from '@supabase/supabase-js'
import {
    emailSchema, passwordSchema, usernameSchema, bioSchema,
    selectedTitleSchema, favoriteGameIdsSchema, privacyTypeSchema, parseOrError,
} from '@/lib/schemas'

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
    const parsed = parseOrError(bioSchema, bio)
    if (!parsed.success) return { error: parsed.error }

    const { error } = await supabase.from('users').update({ user_bio: parsed.data }).eq('id', userId)
    return { error: error?.message ?? null }
}

export async function updateUsername(supabase: SupabaseClient, userId: string, username: string) {
    const parsed = parseOrError(usernameSchema, username)
    if (!parsed.success) return { data: null, error: parsed.error }

    const { data, error } = await supabase
        .from('users')
        .update({ username: parsed.data })
        .eq('id', userId)
        .select('username')
        .single()

    if (error) return { data: null, error: error.message }
    return { data, error: null }
}

export async function updateSelectedTitle(supabase: SupabaseClient, userId: string, title: string) {
    const parsed = parseOrError(selectedTitleSchema, title)
    if (!parsed.success) return { title: null, error: parsed.error }

    const { data, error } = await supabase
        .from('users')
        .update({ selected_title: parsed.data })
        .eq('id', userId)
        .select('selected_title')
        .single()

    if (error) return { title: null, error: error.message }
    return { title: data?.selected_title, error: null }
}

export async function updateFavoriteGames(supabase: SupabaseClient, userId: string, gameIds: string[]) {
    const parsed = parseOrError(favoriteGameIdsSchema, gameIds)
    if (!parsed.success) return { error: parsed.error }

    const { error } = await supabase
        .from('users')
        .update({ favorite_game_ids: parsed.data })
        .eq('id', userId)
        .select('favorite_game_ids')
        .single()

    return { error: error?.message ?? null }
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

    return error?.message ?? null
}

export async function signInWithPassword(supabase: SupabaseClient, email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error
}

export async function signUpWithPassword(
    supabase: SupabaseClient,
    { email, password, username }: { email: string, password: string, username: string },
    emailRedirectTo?: string,
) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username }, emailRedirectTo }
    })
    return { data, error }
}

export async function signOut(supabase: SupabaseClient) {
    await supabase.auth.signOut()
}

export async function updateEmail(supabase: SupabaseClient, email: string) {
    const parsed = parseOrError(emailSchema, email)
    if (!parsed.success) return parsed.error

    const { error } = await supabase.auth.updateUser({ email: parsed.data })
    return error?.message ?? null
}

export async function updatePassword(supabase: SupabaseClient, password: string) {
    const parsed = parseOrError(passwordSchema, password)
    if (!parsed.success) return parsed.error

    const { error } = await supabase.auth.updateUser({ password: parsed.data })
    return error?.message ?? null
}

const PRIVACY_COLUMN = {
    'Default List': 'default_list_public',
    'Library': 'library_public',
    'Loadout': 'loadout_public',
} as const

export async function updatePrivacy(supabase: SupabaseClient, privacy: boolean, type: string, userId: string) {
    const parsed = parseOrError(privacyTypeSchema, type)
    if (!parsed.success) return parsed.error

    const { error } = await supabase
        .from('users')
        .update({ [PRIVACY_COLUMN[parsed.data]]: privacy })
        .eq('id', userId)

    return error?.message ?? null
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
