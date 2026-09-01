import { createClient } from '@supabase/supabase-js'
import { createLoggingFetch } from './supabase-logging'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Browser client — use this in Client Components ('use client' files)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: createLoggingFetch('browser-raw') },
})