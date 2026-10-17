import { router, type Href } from 'expo-router'

export function go(href: string) {
  router.push(href as Href)
}

export function back() {
  router.back()
}

/** Leave a sign-in or sign-up screen. A direct open has no screen to return to. */
export function backOrHome() {
  if (router.canGoBack()) router.back()
  else router.replace('/' as Href)
}
