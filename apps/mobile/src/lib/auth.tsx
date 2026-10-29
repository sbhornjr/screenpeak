import type { EmailOtpType, Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppState, Platform } from 'react-native'
import * as Linking from 'expo-linking'

import { sendPasswordReset } from './mobile-client'
import {
  claimResetSend,
  completeAuthCallback,
  newPasswordProblem,
  passwordResetRedirectBase,
  passwordResetRedirectTo,
  releaseResetSend,
  resetOutcome,
  RESET_LINK_HINT,
  SITE_ORIGIN,
  type ResetOutcome,
} from './password-reset'
import { readRecovery, writeRecovery } from './recovery-session'
import { signUpAuthBody } from './sign-up'
import { authConfigError } from './auth-config'
import { supabase } from './supabase'

type AuthValue = {
  ready: boolean
  session: Session | null
  configured: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, username: string) => Promise<string>
  signOut: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<ResetOutcome>
  resetSentAt: number | null
  openRecoveryLink: (url: string) => Promise<string>
  updatePassword: (password: string, again: string) => Promise<void>
  finishPasswordChange: () => void
  abandonRecovery: () => Promise<void>
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
  const [resetSentAt, setResetSentAt] = useState<number | null>(null)
  const lastResetAt = useRef<number | null>(null)

  useEffect(() => {
    if (!supabase) return
    let live = true
    supabase.auth.getSession().then(({ data }) => {
      if (!live) return
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      setReady(true)
      if (event === 'PASSWORD_RECOVERY') writeRecovery(true)
      if (event === 'SIGNED_OUT') writeRecovery(false)
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
      if (!supabase) throw new Error(authConfigError())
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    },
    async signUp(email, password, username) {
      if (!supabase) throw new Error(authConfigError('Sign-up'))
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
    resetSentAt,
    async requestPasswordReset(email) {
      if (!supabase) throw new Error(authConfigError())
      const claim = claimResetSend(email, lastResetAt.current, Date.now())
      lastResetAt.current = claim.lastSentAt
      if (!claim.decision.send) {
        if ('confirmation' in claim.decision) return { confirmation: claim.decision.confirmation }
        return { error: claim.decision.message }
      }
      setResetSentAt(claim.lastSentAt)
      try {
        const { error } = await sendPasswordReset(supabase, claim.decision.email, passwordResetRedirect())
        const outcome = resetOutcome(error ? { code: error.code, message: error.message } : null)
        const released = releaseResetSend(lastResetAt.current, outcome)
        lastResetAt.current = released
        setResetSentAt(released)
        return outcome
      } catch (err) {
        lastResetAt.current = null
        setResetSentAt(null)
        throw err
      }
    },
    async openRecoveryLink(url) {
      const client = supabase
      if (!client) throw new Error(authConfigError())
      const origin = Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.origin
        : SITE_ORIGIN
      const result = await completeAuthCallback(url, {
        verifyOtp: ({ type, token_hash }) => client.auth.verifyOtp({
          type: type as EmailOtpType,
          token_hash,
        }),
        exchangeCodeForSession: async (code) => {
          const { data, error } = await client.auth.exchangeCodeForSession(code)
          const redirectType = (data as { redirectType?: string | null } | null)?.redirectType
          return { error, recovery: redirectType === 'recovery' }
        },
      }, origin)
      if (result.recovery) writeRecovery(true)
      return result.destination
    },
    async updatePassword(password, again) {
      if (!supabase) throw new Error(authConfigError())
      if (!readRecovery()) throw new Error(RESET_LINK_HINT)
      const problem = newPasswordProblem(password, again)
      if (problem) throw new Error(problem)
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
    },
    finishPasswordChange() {
      writeRecovery(false)
    },
    async abandonRecovery() {
      if (!readRecovery()) return
      const client = supabase
      if (!client) {
        writeRecovery(false)
        return
      }
      const { error } = await client.auth.signOut()
      if (error) throw error
      writeRecovery(false)
    },
  }), [ready, session, resetSentAt])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
