import { parseOrError, usernameSchema } from '@screenpeak/shared/schemas'

/** Body for supabase.auth.signUp. The username is stored in user metadata so
 *  handle_new_user does not fall back to the email local-part, which fails
 *  ^[A-Za-z0-9_]{3,20}$ for most addresses. */
export function signUpAuthBody(email: string, password: string, username: string):
  | { ok: false, error: string }
  | { ok: true, body: { email: string, password: string, options: { data: { username: string } } } } {
  const parsed = parseOrError(usernameSchema, username)
  if (!parsed.success) return { ok: false, error: parsed.error }
  return {
    ok: true,
    body: {
      email,
      password,
      options: { data: { username: parsed.data } },
    },
  }
}
