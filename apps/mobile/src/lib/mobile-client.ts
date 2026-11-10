import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js'

type FetchLike = typeof fetch

type Flow = 'implicit' | 'pkce'

const MOBILE_FLOW: Flow = 'implicit'

/** The phone client stays on Supabase's default implicit flow. Sign-up
 *  confirmation links open the website, which does not have a verifier that
 *  was stored on the phone. Password reset opts into PKCE for that one call. */
export function createMobileClient(
  url: string,
  anonKey: string,
  storage: SupportedStorage,
  fetchImpl?: FetchLike,
): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      flowType: MOBILE_FLOW,
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // A custom fetch is the unit-test seam. Skip the startup session read so
      // that fetch is not called before the test's sign-up or reset request.
      skipAutoInitialize: Boolean(fetchImpl),
    },
    global: fetchImpl ? { fetch: fetchImpl } : undefined,
  })
}

type FlowAuth = SupabaseClient['auth'] & { flowType: Flow }

/**
 * auth-js has no per-call flow option, and a second client on the same storage
 * key is what it warns against. resetPasswordForEmail reads `flowType` before
 * its first await, so the client is back on MOBILE_FLOW before any other auth
 * call can run. auth-flows.test.ts fails if an upgrade moves that read.
 */
export function sendPasswordReset(client: SupabaseClient, email: string, redirectTo: string) {
  const auth = client.auth as FlowAuth
  auth.flowType = 'pkce'
  try {
    return auth.resetPasswordForEmail(email, { redirectTo })
  } finally {
    auth.flowType = MOBILE_FLOW
  }
}
