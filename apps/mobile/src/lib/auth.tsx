import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AppState, Platform } from 'react-native'

import { signUpAuthBody } from './sign-up'
import { supabase } from './supabase'

type AuthValue = {
  ready: boolean
  session: Session | null
  configured: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, username: string) => Promise<string>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(supabase == null)

  useEffect(() => {
    if (!supabase) return
    let live = true
    supabase.auth.getSession().then(({ data }) => {
      if (!live) return
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setReady(true)
    })
    return () => {
      live = false
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const client = supabase
    if (!client || Platform.OS === 'web') return
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') client.auth.startAutoRefresh()
      else client.auth.stopAutoRefresh()
    })
    return () => sub.remove()
  }, [])

  const value = useMemo<AuthValue>(() => ({
    ready,
    session,
    configured: supabase != null,
    async signIn(email, password) {
      if (!supabase) throw new Error('Sign-in is not configured.')
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    },
    async signUp(email, password, username) {
      if (!supabase) throw new Error('Sign-up is not configured.')
      const parsed = signUpAuthBody(email, password, username)
      if (!parsed.ok) throw new Error(parsed.error)
      const { data, error } = await supabase.auth.signUp(parsed.body)
      if (error) throw error
      if (!data.session) return 'Check your email to confirm the account, then log in.'
      return ''
    },
    async signOut() {
      if (!supabase) return
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    },
  }), [ready, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
