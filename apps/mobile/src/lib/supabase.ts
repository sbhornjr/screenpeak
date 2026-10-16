import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'

import { createChunkedStorage, type StringStore } from './secure-session'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

function webStorage(): StringStore {
  return {
    getItem: async (key) => globalThis.localStorage?.getItem(key) ?? null,
    setItem: async (key, value) => {
      globalThis.localStorage?.setItem(key, value)
    },
    removeItem: async (key) => {
      globalThis.localStorage?.removeItem(key)
    },
  }
}

function nativeStorage(): StringStore {
  return createChunkedStorage({
    async getItem(key) {
      const SecureStore = await import('expo-secure-store')
      return SecureStore.getItemAsync(key)
    },
    async setItem(key, value) {
      const SecureStore = await import('expo-secure-store')
      await SecureStore.setItemAsync(key, value)
    },
    async removeItem(key) {
      const SecureStore = await import('expo-secure-store')
      await SecureStore.deleteItemAsync(key)
    },
  })
}

/** Null when the public Supabase env is unset. The game screen still loads signed out. */
export const supabase: SupabaseClient | null = url && anonKey
  ? createClient(url, anonKey, {
      auth: {
        storage: Platform.OS === 'web' ? webStorage() : nativeStorage(),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null
