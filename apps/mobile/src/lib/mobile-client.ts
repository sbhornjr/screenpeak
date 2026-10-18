import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js'

type FetchLike = typeof fetch

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

type FlowAuth = SupabaseClient['auth'] & { flowType: 'implicit' | 'pkce' }

export async function sendPasswordReset(
  client: SupabaseClient,
  email: string,
  redirectTo: string,
) {
  const auth = client.auth as FlowAuth
  const previous = auth.flowType
  auth.flowType = 'pkce'
  try {
    return await auth.resetPasswordForEmail(email, { redirectTo })
  } finally {
    auth.flowType = previous
  }
}
