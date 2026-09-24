// Split out of lib/queries/user.ts: these are Supabase Auth/Storage calls, not
// Postgres queries, and several are called directly from 'use client' components
// (UserContext.tsx, AuthModal.tsx, ChangePasswordButton.tsx, AvatarUploader.tsx,
// DeleteUserButton.tsx, ChangeEmailButton.tsx). Keeping them in a file with zero
// import of '@/lib/db' matters — that module constructs a Node-only `postgres`
// client at module scope, and a bundler pulls in a whole module's top-level
// imports even when a consumer only uses one of its exports. UserContext.tsx in
// particular renders in the root layout, so mixing these into user.ts (which does
// `import { db } from '@/lib/db'`) broke every single page in the app, trying to
// bundle the Postgres driver's Node built-ins ('fs', 'net', etc.) into the browser.
import type { SupabaseClient } from '@supabase/supabase-js'
import { emailSchema, passwordSchema, parseOrError } from '@/lib/schemas'

export async function getViewer(supabase: SupabaseClient) {
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

export async function getProfileSummaryById(supabase: SupabaseClient, userId: string) {
    const { data } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url')
        .eq('id', userId)
        .single()

    return data
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

// Supabase Auth admin API, not a Postgres query. public.users cleanup happens
// automatically via the ON DELETE CASCADE FK from auth.users.
export async function deleteUserAccount(adminClient: SupabaseClient, userId: string) {
    const { error } = await adminClient.auth.admin.deleteUser(userId)
    return error
}
