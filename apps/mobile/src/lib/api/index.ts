import Constants from 'expo-constants'

import { apiBaseUrlFromEnv, devApiRuntime } from '../api-base'
import { createApiClient } from './client'
import { supabase } from '../supabase'

const baseUrl = apiBaseUrlFromEnv(
  {
    dev: devApiRuntime(typeof __DEV__ === 'undefined' ? undefined : __DEV__),
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  },
  Constants,
)

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
