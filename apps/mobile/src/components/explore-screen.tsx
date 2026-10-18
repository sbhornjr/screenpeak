import type { ExplorePageData, ExploreRange } from '@screenpeak/shared/api/explore'
import type { Taxon } from '@screenpeak/shared/api/games'
import type { GameSearchHit } from '@screenpeak/shared/api/search'
import { useState } from 'react'
import { Text } from 'react-native'

import { catalogueHref, gameHref, listHref, profileHref } from '@/lib/routes'

import { Button } from './button'
import { EmptyState } from './empty-state'
import { SectionHead } from './section-head'
import { ScreenScroll, screenStyles, PanelRow, SignupButtons } from './screen-scroll'
import { TextField } from './text-field'

const RANGES: { id: ExploreRange, label: string }[] = [
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'year', label: 'This year' },
  { id: 'alltime', label: 'All time' },
]

export function ExploreScreen({
  data,
  genres,
  platforms,
  results,
  searching,
  searchError,
  onSearch,
  onOpen,
  onRange,
}: {
  data: ExplorePageData
  genres: Taxon[]
  platforms: Taxon[]
  results: GameSearchHit[] | null
  searching: boolean
  searchError: string | null
  onSearch: (query: string) => void
  onOpen: (href: string) => void
  onRange: (range: ExploreRange) => void
}) {
  const [query, setQuery] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const rangeLabel = RANGES.find(range => range.id === data.range)?.label ?? 'This week'

  function submit() {
    const trimmed = query.trim()
    if (!trimmed) {
      setHint('Type a game name.')
      return
    }
    setHint(null)
    onSearch(trimmed)
  }

  return (
    <ScreenScroll title="Explore">
      <TextField
        label="Search games"
        placeholder="Search games"
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={submit}
      />
      <Button label="Search" onPress={submit} />
      {hint ? <Text style={screenStyles.muted}>{hint}</Text> : null}
      {searching ? <Text style={screenStyles.muted}>Searching</Text> : null}
      {searchError ? <Text style={screenStyles.muted}>{searchError}</Text> : null}
      {results ? (
        results.length === 0 ? <EmptyState dense title="No games match." /> : results.map(game => (
          <PanelRow key={game.id} accessibilityRole="link" accessibilityLabel={game.name} onPress={() => onOpen(gameHref(game.slug))}>
            <Text style={screenStyles.body}>{game.name}</Text>
          </PanelRow>
        ))
      ) : null}

      <Text style={screenStyles.muted}>Range: {rangeLabel}</Text>
      {RANGES.map(range => (
        <Button key={range.id} label={range.label} variant="secondary" onPress={() => onRange(range.id)} />
      ))}

      <SectionHead>Trending</SectionHead>
      {data.trending_games.length === 0 && data.trending_lists.length === 0 ? (
        <EmptyState dense title="Nothing trending right now." />
      ) : null}
      {data.trending_games.map(game => (
        <PanelRow key={game.id} accessibilityRole="link" accessibilityLabel={game.name} onPress={() => onOpen(gameHref(game.slug))}>
          <Text style={screenStyles.body}>{game.name}</Text>
        </PanelRow>
      ))}
      {data.trending_lists.map(list => (
        <PanelRow key={list.id} accessibilityRole="link" accessibilityLabel={list.name} onPress={() => onOpen(listHref(list.owner_username, list.id))}>
          <Text style={screenStyles.body}>{list.name}</Text>
        </PanelRow>
      ))}

      <SectionHead>Friends&apos; activity</SectionHead>
      {data.recommendations == null ? (
        <>
          <Text style={screenStyles.muted}>Sign up to see what people you follow are playing.</Text>
          <SignupButtons onOpen={onOpen} />
        </>
      ) : data.recommendations.games.length === 0 ? (
        <EmptyState dense title="No games from people you follow yet." />
      ) : data.recommendations.games.map(game => (
        <PanelRow
          key={game.id}
          accessibilityRole="link"
          accessibilityLabel={`${game.name}, ${game.follower_count ?? 0} followers completed`}
          onPress={() => onOpen(gameHref(game.slug))}
        >
          <Text style={screenStyles.body}>{game.name}</Text>
          <Text style={screenStyles.detail}>{game.follower_count ?? 0} followers completed</Text>
        </PanelRow>
      ))}

      <SectionHead>Recommendations</SectionHead>
      {data.recommendations == null ? (
        <>
          <Text style={screenStyles.muted}>Sign up to get recommendations.</Text>
          <SignupButtons onOpen={onOpen} />
        </>
      ) : (
        <>
          {data.recommendations.lists.length === 0 && data.recommendations.users.length === 0 ? (
            <EmptyState dense title="No recommendations yet." />
          ) : null}
          {data.recommendations.lists.map(list => (
            <PanelRow key={list.id} accessibilityRole="link" accessibilityLabel={list.name} onPress={() => onOpen(listHref(list.owner_username, list.id))}>
              <Text style={screenStyles.body}>{list.name}</Text>
            </PanelRow>
          ))}
          {data.recommendations.users.map(user => (
            <PanelRow key={user.id} accessibilityRole="link" accessibilityLabel={user.username} onPress={() => onOpen(profileHref(user.username))}>
              <Text style={screenStyles.body}>{user.username}</Text>
            </PanelRow>
          ))}
        </>
      )}

      <SectionHead>Browse by genre</SectionHead>
      {genres.map(genre => (
        <Button key={genre.id} label={genre.name} accessibilityLabel={`Browse ${genre.name}`} variant="secondary" onPress={() => onOpen(catalogueHref({ genre: genre.slug }))} />
      ))}
      <SectionHead>Browse by platform</SectionHead>
      {platforms.map(platform => (
        <Button key={platform.id} label={platform.name} accessibilityLabel={`Browse ${platform.name}`} variant="secondary" onPress={() => onOpen(catalogueHref({ platform: platform.slug }))} />
      ))}
      <Button label="Browse all" variant="secondary" onPress={() => onOpen(catalogueHref())} />
    </ScreenScroll>
  )
}
