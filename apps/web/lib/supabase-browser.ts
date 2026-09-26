import { createBrowserClient } from '@supabase/ssr'
import { createLoggingFetch } from './supabase-logging'

export function createClient() {
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { fetch: createLoggingFetch('browser-ssr') } }
    )
}