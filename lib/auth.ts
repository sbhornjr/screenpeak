import { createClient } from '@/lib/supabase-server'

export async function requireUser(): Promise<{ id: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthenticated')
    return user
}
