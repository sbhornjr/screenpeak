import { router, type Href } from 'expo-router'

const TAB_HREFS = new Set(['/', '/explore', '/library', '/profile'])

export function go(href: string) {
  const target = href as Href
  if (!TAB_HREFS.has(href)) {
    router.push(target)
    return
  }
  // Native tabs switch on NAVIGATE. dismissTo is POP_TO, and that router
  // drops it, so a library preview tapped from the Profile tab stays put.
  // A detail screen stacked above the tabs has to be dismissed or the hub
  // stays on top of the Library tab.
  if (router.canDismiss()) router.dismissTo(target)
  else router.navigate(target)
}

/** Detail screens use this. A cold open has no screen underneath, so it returns home. */
export function back() {
  backOrHome()
}

/** Leave a sign-in or sign-up screen. A direct open has no screen to return to. */
export function backOrHome() {
  if (router.canGoBack()) router.back()
  else router.replace('/' as Href)
}
