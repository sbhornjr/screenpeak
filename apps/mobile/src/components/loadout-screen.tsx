import type { LoadoutGenre } from '@screenpeak/shared/api/loadout'
import { Text } from 'react-native'

import { ScreenScroll, screenStyles, SectionLabel } from './screen-scroll'

export function LoadoutScreen({
  username,
  identity,
  ratingCount,
  avgRating,
  genres,
  onBack,
}: {
  username: string
  identity: string
  ratingCount: number
  avgRating: number | null
  genres: LoadoutGenre[]
  onBack?: () => void
}) {
  return (
    <ScreenScroll title={`${username}'s Loadout`} onBack={onBack}>
      <Text style={screenStyles.body}>{identity.trim() ? identity : 'No Read-out yet.'}</Text>
      <Text style={screenStyles.muted}>{`${ratingCount} rated${avgRating == null ? '' : ` · ${avgRating} average`}`}</Text>
      {genres.length > 0 ? <SectionLabel>Genres</SectionLabel> : null}
      {genres.map(genre => (
        <Text key={genre.genre_name} style={screenStyles.body}>{genre.genre_name}</Text>
      ))}
    </ScreenScroll>
  )
}
