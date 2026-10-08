import { createClient } from '@supabase/supabase-js'
import { createLoggingFetch } from './supabase-logging'

// A Supabase client with no cookies and no session storage, for verifying a
// bearer token the phone app sends (`supabase.auth.getUser(token)`). Server
// only in practice — it's used by lib/auth.ts — but holds nothing secret: the
// anon key is public. Make a fresh one per request; nothing is persisted.
export function createStatelessClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
            global: { fetch: createLoggingFetch('stateless') },
        }
    )
}
