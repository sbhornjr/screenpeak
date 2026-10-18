import type { EmailOtpType, Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppState, Platform } from 'react-native'
import * as Linking from 'expo-linking'

import {
  completeAuthCallback,
  newPasswordProblem,
  passwordResetRedirectBase,
  passwordResetRedirectTo,
  resetOutcome,
  resetSendDecision,
  type ResetOutcome,
} from './password-reset'
import { signUpAuthBody } from './sign-up'
import { supabase } from './supabase'

type AuthValue = {
  ready: boolean
  session: Session | null
  configured: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, username: string) => Promise<string>
  signOut: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<ResetOutcome>
  openRecoveryLink: (url: string) => Promise<string>
  updatePassword: (password: string, again: string) => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

function passwordResetRedirect(): string {
  if (Platform.OS === 'web') {
    const origin = typeof window === 'undefined' ? 'http://localhost:8081' : window.location.origin
    return passwordResetRedirectTo(passwordResetRedirectBase('web', origin, 'screenpeak'))
  }
  return passwordResetRedirectTo(passwordResetRedirectBase('native', '', Linking.resolveScheme({})))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(supabase == null)
  const lastResetAt = useRef<number | null>(null)

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
    async requestPasswordReset(email) {
      if (!supabase) throw new Error('Sign-in is not configured.')
      const decision = resetSendDecision(email, lastResetAt.current, Date.now())
      if (!decision.send) {
        if ('confirmation' in decision) return { confirmation: decision.confirmation }
        return { error: decision.message }
      }
      const { error } = await supabase.auth.resetPasswordForEmail(decision.email, {
        redirectTo: passwordResetRedirect(),
      })
      const outcome = resetOutcome(error ? { code: error.code, message: error.message } : null)
      if ('confirmation' in outcome) lastResetAt.current = Date.now()
      return outcome
    },
    async openRecoveryLink(url) {
      const client = supabase
      if (!client) throw new Error('Sign-in is not configured.')
      const origin = Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.origin
        : 'https://screenpeak.app'
      const result = await completeAuthCallback(url, {
        verifyOtp: ({ type, token_hash }) => client.auth.verifyOtp({
          type: type as EmailOtpType,
          token_hash,
        }),
        exchangeCodeForSession: (code) => client.auth.exchangeCodeForSession(code),
        setSession: (tokens) => client.auth.setSession(tokens),
      }, origin)
      return result.destination
    },
    async updatePassword(password, again) {
      if (!supabase) throw new Error('Sign-in is not configured.')
      const problem = newPasswordProblem(password, again)
      if (problem) throw new Error(problem)
      const { error } = await supabase.auth.updateUser({ password })
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
