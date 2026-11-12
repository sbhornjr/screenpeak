import { Platform, Share } from 'react-native'

import { SITE_ORIGIN } from './password-reset'
import { gameHref, listHref, profileHref } from './routes'

export function gameShareUrl(slug: string): string {
  return `${SITE_ORIGIN}${gameHref(slug)}`
}

export function profileShareUrl(username: string): string {
  return `${SITE_ORIGIN}${profileHref(username)}`
}

export function listShareUrl(username: string, listId: string): string {
  return `${SITE_ORIGIN}${listHref(username, listId)}`
}

export type ShareOutcome = 'shared' | 'copied' | 'dismissed' | 'unsupported'

type WebShareNavigator = {
  share?: (data: { url?: string, title?: string }) => Promise<void>
  clipboard?: { writeText?: (text: string) => Promise<void> }
}

/**
 * Opens the native share sheet for `url`. There is no share sheet on web: it
 * tries the Web Share API first, then falls back to the clipboard — the only
 * one of the four outcomes that needs its own in-app confirmation, since
 * nothing else tells the viewer the link was copied.
 */
export async function shareUrl(url: string, title: string): Promise<ShareOutcome> {
  if (Platform.OS === 'web') return shareOnWeb(url, title)
  try {
    const result = await Share.share(Platform.OS === 'ios' ? { url, title } : { message: url, title })
    return result.action === Share.dismissedAction ? 'dismissed' : 'shared'
  } catch {
    return 'dismissed'
  }
}

async function shareOnWeb(url: string, title: string): Promise<ShareOutcome> {
  const nav = typeof navigator === 'undefined' ? undefined : navigator as Navigator & WebShareNavigator
  if (nav?.share) {
    try {
      await nav.share({ url, title })
      return 'shared'
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'dismissed'
    }
  }
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(url)
      return 'copied'
    } catch {
      return 'unsupported'
    }
  }
  return 'unsupported'
}
