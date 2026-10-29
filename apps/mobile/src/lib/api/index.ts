import Constants from 'expo-constants'

import { apiBaseUrlFromEnv, isDevRuntime, MissingDevHostError } from '../api-base'
import { createApiClient } from './client'
import { supabase } from '../supabase'

const dev = isDevRuntime()

function resolveBaseUrl(): string {
  try {
    return apiBaseUrlFromEnv(
      {
        dev,
        EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
      },
      Constants,
    )
  } catch (error) {
    if (dev && error instanceof MissingDevHostError) return ''
    throw error
  }
}

const baseUrl = resolveBaseUrl()

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
