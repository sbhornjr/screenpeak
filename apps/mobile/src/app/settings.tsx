import { back } from '@/lib/go'

import { EmptyState } from '@/components/empty-state'
import { ScreenScroll } from '@/components/screen-scroll'

/** Profile editing (photo, title, bio, favorites, account) lands in a later pass. */
export default function SettingsRoute() {
  return (
    <ScreenScroll title="Settings" onBack={back}>
      <EmptyState
        dense
        title="Profile editing is not on this screen yet."
        description="Username, bio, title, photo, and favorite games land here later."
      />
    </ScreenScroll>
  )
}
