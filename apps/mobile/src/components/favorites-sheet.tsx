// The website's FavoriteGamePicker as a sheet.
import type { GameSearchHit } from '@screenpeak/shared/api/search'
import { FAVORITE_GAMES_MAX } from '@screenpeak/shared/constants'
import { useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { actionFailure } from '@/lib/failure'
import { picksLine, toggleFavorite, type FavoritePick } from '@/lib/favorite-games'
import { useSingleFlight } from '@/lib/single-flight'
import { useAction } from '@/lib/use-action'
import { useOnOpen } from '@/lib/use-on-open'
import { space, text } from '@/theme'

import { ActionError } from './action-error'
import { Button } from './button'
import { Sheet } from './sheet'
import { TextField } from './text-field'

export function FavoritesSheet({
  visible,
  current,
  onClose,
  onSearch,
  onSave,
}: {
  visible: boolean
  current: FavoritePick[]
  onClose: () => void
  onSearch: (query: string) => Promise<GameSearchHit[]>
  /** Saves the ids in order. The failure sentence, or null. */
  onSave: (gameIds: string[]) => Promise<string | null>
}) {
  const [picks, setPicks] = useState<FavoritePick[]>(current)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<GameSearchHit[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const generation = useRef(0)
  const searchFlight = useSingleFlight()
  const save = useAction()

  useOnOpen(visible, () => {
    setPicks(current)
    setQuery('')
    setHits([])
    setSearchError(null)
    save.clear()
  })

  function search() {
    const needle = query.trim()
    if (!needle) {
      setHits([])
      setSearchError('Type a game name.')
      return
    }
    void searchFlight(async () => {
      const request = ++generation.current
      setSearching(true)
      setSearchError(null)
      try {
        const found = await onSearch(needle)
        if (request !== generation.current) return
        setHits(found)
      } catch (failure) {
        if (request !== generation.current) return
        setHits([])
        setSearchError(actionFailure(failure))
      } finally {
        if (request === generation.current) setSearching(false)
      }
    }, needle)
  }

  const picked = new Set(picks.map(pick => pick.id))
  const full = picks.length >= FAVORITE_GAMES_MAX
  const results = hits.filter(hit => !picked.has(hit.id))

  return (
    <Sheet visible={visible} title="Choose favorite games" onClose={onClose}>
      <Text style={text.body}>{`You can only select ${FAVORITE_GAMES_MAX} favorite games. Choose wisely.`}</Text>
      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <TextField
            label="Search games"
            hideLabel
            placeholder="Search games"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={search}
          />
        </View>
        <Button label={searching ? 'Searching…' : 'Search'} accessibilityLabel="Search" onPress={search} />
      </View>
      {searchError ? <Text accessibilityLiveRegion="polite" style={text.error}>{searchError}</Text> : null}
      <Text accessibilityLiveRegion="polite" style={text.meta}>{picksLine(picks.length)}</Text>
      {picks.map(pick => (
        <Button
          key={pick.id}
          label={pick.name}
          accessibilityLabel={`${pick.name}, picked`}
          selected
          variant="secondary"
          onPress={() => setPicks(toggleFavorite(picks, pick))}
        />
      ))}
      {results.length > 0 ? <Text style={text.meta}>Results</Text> : null}
      {results.map(hit => (
        <Button
          key={hit.id}
          label={hit.name}
          variant="secondary"
          disabled={full}
          onPress={() => setPicks(toggleFavorite(picks, hit))}
        />
      ))}
      <ActionError error={save.error} onRetry={save.canRetry ? save.retry : undefined} />
      <Button
        label={save.busy ? 'Saving…' : 'Save favorites'}
        accessibilityLabel="Save favorites"
        disabled={save.busy}
        onPress={() => { void save.run(() => onSave(picks.map(pick => pick.id)), onClose) }}
      />
    </Sheet>
  )
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  searchField: { flex: 1 },
})
