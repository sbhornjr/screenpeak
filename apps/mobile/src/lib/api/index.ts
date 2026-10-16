import { createApiClient } from './client'
import { supabase } from '../supabase'

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? ''

export const api = createApiClient({
  baseUrl,
  getToken: async () => {
    if (!supabase) return null
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  },
})

export function apiConfigured(): boolean {
  return baseUrl.length > 0
}
