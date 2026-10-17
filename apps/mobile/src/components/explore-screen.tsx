import type { ExplorePageData, ExploreRange } from '@screenpeak/shared/api/explore'
import type { Taxon } from '@screenpeak/shared/api/games'
import type { GameSearchHit } from '@screenpeak/shared/api/search'
import { useState } from 'react'
import { Pressable, Text, TextInput } from 'react-native'

import { catalogueHref, gameHref, listHref, profileHref } from '@/lib/routes'
import { colors } from '@/theme'

import { ScreenScroll, screenStyles, SectionLabel, SignupButtons } from './screen-scroll'

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
      <TextInput
        accessibilityLabel="Search games"
        placeholder="Search games"
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={submit}
        placeholderTextColor={colors.muted}
        style={screenStyles.input}
      />
      <Pressable accessibilityRole="button" accessibilityLabel="Search" onPress={submit} style={screenStyles.rowButton}>
        <Text style={screenStyles.rowText}>Search</Text>
      </Pressable>
      {hint ? <Text style={screenStyles.muted}>{hint}</Text> : null}
      {searching ? <Text style={screenStyles.muted}>Searching</Text> : null}
      {searchError ? <Text style={screenStyles.muted}>{searchError}</Text> : null}
      {results ? (
        results.length === 0 ? <Text style={screenStyles.muted}>No games match.</Text> : results.map(game => (
          <Pressable
            key={game.id}
            accessibilityRole="link"
            accessibilityLabel={game.name}
            onPress={() => onOpen(gameHref(game.slug))}
            style={screenStyles.rowButton}
          >
            <Text style={screenStyles.rowText}>{game.name}</Text>
          </Pressable>
        ))
      ) : null}

      <Text style={screenStyles.muted}>Range: {rangeLabel}</Text>
      {RANGES.map(range => (
        <Pressable key={range.id} accessibilityRole="button" accessibilityLabel={range.label} onPress={() => onRange(range.id)} style={screenStyles.rowButton}>
          <Text style={screenStyles.rowText}>{range.label}</Text>
        </Pressable>
      ))}

      <SectionLabel>Trending</SectionLabel>
      {data.trending_games.length === 0 && data.trending_lists.length === 0 ? (
        <Text style={screenStyles.muted}>Nothing trending right now.</Text>
      ) : null}
      {data.trending_games.map(game => (
        <Pressable key={game.id} accessibilityRole="link" accessibilityLabel={game.name} onPress={() => onOpen(gameHref(game.slug))} style={screenStyles.rowButton}>
          <Text style={screenStyles.rowText}>{game.name}</Text>
        </Pressable>
      ))}
      {data.trending_lists.map(list => (
        <Pressable key={list.id} accessibilityRole="link" accessibilityLabel={list.name} onPress={() => onOpen(listHref(list.owner_username, list.id))} style={screenStyles.rowButton}>
          <Text style={screenStyles.rowText}>{list.name}</Text>
        </Pressable>
      ))}

      <SectionLabel>Friends&apos; activity</SectionLabel>
      {data.recommendations == null ? (
        <>
          <Text style={screenStyles.muted}>Sign up to see what people you follow are playing.</Text>
          <SignupButtons onOpen={onOpen} />
        </>
      ) : data.recommendations.games.length === 0 ? (
        <Text style={screenStyles.muted}>No games from people you follow yet.</Text>
      ) : data.recommendations.games.map(game => (
        <Pressable
          key={game.id}
          accessibilityRole="link"
          accessibilityLabel={`${game.name}, ${game.follower_count ?? 0} followers completed`}
          onPress={() => onOpen(gameHref(game.slug))}
          style={screenStyles.rowButton}
        >
          <Text style={screenStyles.rowText}>{game.name}</Text>
          <Text style={screenStyles.detail}>{game.follower_count ?? 0} followers completed</Text>
        </Pressable>
      ))}

      <SectionLabel>Recommendations</SectionLabel>
      {data.recommendations == null ? (
        <>
          <Text style={screenStyles.muted}>Sign up to get recommendations.</Text>
          <SignupButtons onOpen={onOpen} />
        </>
      ) : (
        <>
          {data.recommendations.lists.length === 0 && data.recommendations.users.length === 0 ? (
            <Text style={screenStyles.muted}>No recommendations yet.</Text>
          ) : null}
          {data.recommendations.lists.map(list => (
            <Pressable key={list.id} accessibilityRole="link" accessibilityLabel={list.name} onPress={() => onOpen(listHref(list.owner_username, list.id))} style={screenStyles.rowButton}>
              <Text style={screenStyles.rowText}>{list.name}</Text>
            </Pressable>
          ))}
          {data.recommendations.users.map(user => (
            <Pressable key={user.id} accessibilityRole="link" accessibilityLabel={user.username} onPress={() => onOpen(profileHref(user.username))} style={screenStyles.rowButton}>
              <Text style={screenStyles.rowText}>{user.username}</Text>
            </Pressable>
          ))}
        </>
      )}

      <SectionLabel>Browse by genre</SectionLabel>
      {genres.map(genre => (
        <Pressable key={genre.id} accessibilityRole="button" accessibilityLabel={`Browse ${genre.name}`} onPress={() => onOpen(catalogueHref({ genre: genre.slug }))} style={screenStyles.rowButton}>
          <Text style={screenStyles.rowText}>{genre.name}</Text>
        </Pressable>
      ))}
      <SectionLabel>Browse by platform</SectionLabel>
      {platforms.map(platform => (
        <Pressable key={platform.id} accessibilityRole="button" accessibilityLabel={`Browse ${platform.name}`} onPress={() => onOpen(catalogueHref({ platform: platform.slug }))} style={screenStyles.rowButton}>
          <Text style={screenStyles.rowText}>{platform.name}</Text>
        </Pressable>
      ))}
      <Pressable accessibilityRole="button" accessibilityLabel="Browse all" onPress={() => onOpen(catalogueHref())} style={screenStyles.rowButton}>
        <Text style={screenStyles.rowText}>Browse all</Text>
      </Pressable>
    </ScreenScroll>
  )
}
