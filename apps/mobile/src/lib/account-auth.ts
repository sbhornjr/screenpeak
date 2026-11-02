import { emailSchema } from '@screenpeak/shared/schemas'

import { emailProblem, passwordChangeProblem } from './settings-page'

type AuthFailure = { message: string, code?: string } | null

/** The part of the Supabase client an email or password change uses. */
export type AccountAuthClient = {
  auth: {
    signInWithPassword: (credentials: { email: string, password: string }) => Promise<{ error: AuthFailure }>
    updateUser: (attributes: { email?: string, password?: string }) => Promise<{ error: AuthFailure }>
  }
}

/**
 * The website's ChangePasswordButton: sign in with the current password to prove
 * it, then set the new one. Null on success, or the sentence to show.
 */
export async function changePassword(
  client: AccountAuthClient,
  email: string,
  current: string,
  next: string,
  again: string,
): Promise<string | null> {
  const problem = passwordChangeProblem(current, next, again)
  if (problem) return problem
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: current })
  if (signInError) {
    return signInError.code === 'invalid_credentials' ? 'Current password is incorrect.' : signInError.message
  }
  const { error } = await client.auth.updateUser({ password: next })
  return error ? error.message : null
}

/**
 * The website's ChangeEmailButton. Auth emails a confirmation link, and the
 * address changes only once it is followed.
 */
export async function changeEmail(
  client: AccountAuthClient,
  next: string,
  current: string | null,
): Promise<{ ok: boolean, message: string }> {
  const problem = emailProblem(next, current)
  if (problem) return { ok: false, message: problem }
  const email = emailSchema.parse(next)
  const { error } = await client.auth.updateUser({ email })
  if (error) return { ok: false, message: error.message }
  return { ok: true, message: `Check ${email} for a link to confirm the change. Your email stays the same until you do.` }
}
