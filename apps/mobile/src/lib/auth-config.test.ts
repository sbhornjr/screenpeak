import { afterEach, describe, expect, it } from 'vitest'

import { authConfigError } from './auth-config'

const KEYS = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'] as const

afterEach(() => {
  for (const key of KEYS) delete process.env[key]
})

describe('auth config error', () => {
  it('names both missing variables and apps/mobile/.env in dev', () => {
    const message = authConfigError()
    expect(message).toContain('Sign-in is not configured.')
    expect(message).toContain('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY')
    expect(message).toContain('apps/mobile/.env')
    expect(message).toContain('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY')
    expect(message).toContain('apps/web/.env.local')
  })

  it('names only the variable that is unset', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
    const message = authConfigError()
    expect(message).toContain('Set EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/mobile/.env')
    expect(message).toContain('It matches NEXT_PUBLIC_SUPABASE_ANON_KEY')
    expect(message).not.toContain('EXPO_PUBLIC_SUPABASE_URL and')
  })

  it('stays short in a release build', () => {
    const runtime = globalThis as { __DEV__?: boolean }
    const previous = runtime.__DEV__
    runtime.__DEV__ = false
    try {
      expect(authConfigError()).toBe('Sign-in is not configured.')
      expect(authConfigError('Sign-up')).toBe('Sign-up is not configured.')
    } finally {
      if (previous === undefined) delete runtime.__DEV__
      else runtime.__DEV__ = previous
    }
  })
})
