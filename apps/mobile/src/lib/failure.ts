import { ApiClientError } from './api/client'

/** The sentence a screen shows for a failed request. A 429 names the wait. */
export function actionFailure(error: unknown): string {
  if (error instanceof ApiClientError && error.status === 429) {
    const wait = error.retryAfter
    if (wait != null && wait > 0) {
      return `Too many requests. Try again in ${wait} ${wait === 1 ? 'second' : 'seconds'}.`
    }
    return 'Too many requests. Try again soon.'
  }
  if (error instanceof ApiClientError) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong.'
}

/** Title and body for a screen whose first load failed. */
export function loadFailure(error: unknown): { title: string, body: string } {
  const title = error instanceof ApiClientError && error.status === 429
    ? 'Too many requests'
    : "Couldn't load this screen"
  return { title, body: actionFailure(error) }
}
