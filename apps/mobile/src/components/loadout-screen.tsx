// Port of apps/web/app/user/[username]/loadout/page.tsx and LoadoutActions.
import type { LoadoutPageData } from '@screenpeak/shared/api/loadout'
import { useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useAction } from '@/lib/use-action'
import { readoutState, READOUT_MIN_RATINGS } from '@/lib/loadout-page'
import { catalogueHref } from '@/lib/routes'
import { colors, face, radius, space, text, tierColor, tracking, trackingPx, typeScale } from '@/theme'

import { AppHeader } from './app-header'
import { Button } from './button'
import { DistributionChart } from './distribution-chart'
import { GameRail, RailCard } from './game-rail'
import { Panel } from './panel'
import { SectionHead } from './section-head'
import { Sheet } from './sheet'

type Write = () => Promise<string | null>

export type LoadoutScreenProps = {
  data: LoadoutPageData
  onOpen: (href: string) => void
  onBack: () => void
  /** Owner only. Each resolves to null, or the sentence to show. */
  onGenerate?: Write
  onSaveBio?: Write
  onClear?: Write
  refreshing?: boolean
  onRefresh?: () => void
  refreshError?: string | null
  onRetry?: () => void
}

/** Truncated to two decimals, as the website shows it. */
function average(value: number | null): string {
  return value == null ? '—' : String(Math.trunc(value * 100) / 100)
}

function Stat({ label, value }: { label: string, value: string }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function Favorite({ name, score, line }: { name: string, score: number, line: string }) {
  return (
    <Panel style={styles.favorite}>
      <View accessible accessibilityLabel={`${name}, ${score} average, ${line.replace(' · ', ', ')}`} style={styles.favoriteBody}>
        <Text numberOfLines={2} style={styles.favoriteName}>{name}</Text>
        <View style={styles.favoriteScore}>
          <Text style={[styles.favoriteValue, { color: tierColor(score) }]}>{score}</Text>
          <Text style={styles.meta}>avg</Text>
        </View>
        <Text style={styles.meta}>{line}</Text>
      </View>
    </Panel>
  )
}

function ReadOut({ data, onOpen, onGenerate, onSaveBio, onClear }: Pick<LoadoutScreenProps, 'data' | 'onOpen' | 'onGenerate' | 'onSaveBio' | 'onClear'>) {
  const state = readoutState(data)
  const generate = useAction()
  const save = useAction()
  const clear = useAction()
  const [confirming, setConfirming] = useState(false)
  // A new Read-out has not been saved to the profile yet.
  const [savedFor, setSavedFor] = useState<string | null>(null)
  const owner = state.owner && onGenerate != null
  const error = generate.error ?? save.error ?? clear.error

  function runGenerate() {
    if (onGenerate) void generate.run(onGenerate)
  }

  const generateButton = (label: string) => (
    <Button label={generate.busy ? 'Generating…' : label} disabled={generate.busy} onPress={runGenerate} />
  )

  return (
    <Panel style={styles.readout}>
      <Text style={styles.eyebrow}>The Read-out</Text>
      {state.kind === 'written' ? (
        <Text style={styles.quote}>{`“${state.identity}”`}</Text>
      ) : state.kind === 'locked' && owner ? (
        <>
          <Text style={text.body}>
            {`Rate ${state.needed} more ${state.needed === 1 ? 'game' : 'games'} to unlock your Read-out.`}
          </Text>
          <View style={styles.progressRow}>
            <View accessible accessibilityLabel={`${state.rated} of ${READOUT_MIN_RATINGS} ratings`} style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${(state.rated / READOUT_MIN_RATINGS) * 100}%` }]} />
            </View>
            <Text style={styles.meta}>{`${state.rated} / ${READOUT_MIN_RATINGS}`}</Text>
          </View>
          <Button label="Find games to rate" onPress={() => onOpen(catalogueHref())} />
        </>
      ) : state.kind === 'ready' && owner ? (
        <Text style={text.body}>You haven&apos;t generated a Read-out yet.</Text>
      ) : (
        <Text style={text.body}>No Read-out yet.</Text>
      )}

      {owner && state.kind !== 'locked' ? (
        <View style={styles.actions}>
          {generateButton(state.kind === 'written' ? 'Regenerate' : 'Generate your Read-out')}
          {state.kind === 'written' && onSaveBio ? (
            <Button
              label={savedFor === state.identity ? 'Saved to profile' : 'Save to profile'}
              variant="secondary"
              disabled={save.busy || savedFor === state.identity}
              onPress={() => {
                const identity = state.identity
                void save.run(onSaveBio, () => setSavedFor(identity))
              }}
            />
          ) : null}
          {state.kind === 'written' && onClear ? (
            <Button label="Clear my Read-out" variant="ghost" onPress={() => setConfirming(true)} />
          ) : null}
          <Text style={styles.drafted}>Drafted with AI · edit anytime</Text>
        </View>
      ) : null}
      {error ? <Text accessibilityLiveRegion="polite" style={text.error}>{error}</Text> : null}

      <Sheet visible={confirming} title="Clear your Read-out?" onClose={() => setConfirming(false)}>
        <Text style={text.muted}>
          This removes your generated Read-out and any saved copy of it on your profile. You can generate a new one anytime.
          This isn&apos;t permanent, just gone until you choose to make another.
        </Text>
        <Button label="Cancel" variant="secondary" onPress={() => setConfirming(false)} />
        <Button
          label={clear.busy ? 'Clearing…' : 'Clear it'}
          disabled={clear.busy}
          onPress={() => {
            if (onClear) void clear.run(onClear, () => setConfirming(false))
          }}
        />
      </Sheet>
    </Panel>
  )
}

export function LoadoutScreen({
  data,
  onOpen,
  onBack,
  onGenerate,
  onSaveBio,
  onClear,
  refreshing = false,
  onRefresh,
  refreshError = null,
  onRetry,
}: LoadoutScreenProps) {
  const { width } = useWindowDimensions()
  const compact = width <= 375
  const inset = compact ? space[4] : space[6]
  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader onBack={onBack} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: inset }]}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} /> : undefined}
      >
        <Text style={styles.eyebrow}>Stats screen</Text>
        <Text role="heading" accessibilityRole="header" accessibilityLevel={1} style={styles.title}>{`${data.username}'s Loadout`}</Text>
        <View style={styles.stats}>
          <Stat label="Saved" value={String(data.total_games)} />
          <Stat label="Completed" value={String(data.completed_games)} />
          <Stat label="Rated" value={String(data.rating_count)} />
          <Stat label="Avg" value={average(data.avg_rating)} />
        </View>
        {refreshError ? (
          <View style={styles.stack}>
            <Text accessibilityLiveRegion="polite" style={text.error}>{refreshError}</Text>
            {onRetry ? <Button label="Retry" variant="secondary" onPress={onRetry} /> : null}
          </View>
        ) : null}

        <ReadOut data={data} onOpen={onOpen} onGenerate={onGenerate} onSaveBio={onSaveBio} onClear={onClear} />

        <SectionHead>Scoring style</SectionHead>
        <DistributionChart rows={data.distribution} />

        {data.genres.length > 0 ? (
          <>
            <SectionHead>Favorite genres</SectionHead>
            <View style={styles.grid}>
              {data.genres.map(genre => (
                <Favorite
                  key={genre.genre_name}
                  name={genre.genre_name}
                  score={genre.weighted_rating}
                  line={`${genre.rated_count} rated · ${genre.completed_count} completed`}
                />
              ))}
            </View>
          </>
        ) : null}

        {data.developers.length > 0 ? (
          <>
            <SectionHead>Favorite developers</SectionHead>
            <View style={styles.grid}>
              {data.developers.map(developer => (
                <Favorite
                  key={developer.developer_name}
                  name={developer.developer_name}
                  score={developer.weighted_rating}
                  line={`${developer.rated_count} rated · ${developer.game_count} total`}
                />
              ))}
            </View>
          </>
        ) : null}

        {data.top_games.length > 0 ? (
          <>
            <SectionHead>Top scores</SectionHead>
            <GameRail label="Top scores" inset={inset}>
              {data.top_games.map(game => <RailCard key={game.id} game={game} onOpen={onOpen} />)}
            </GameRail>
          </>
        ) : null}

        {data.bottom_games.length > 0 ? (
          <>
            <SectionHead>Bottom scores</SectionHead>
            <GameRail label="Bottom scores" inset={inset}>
              {data.bottom_games.map(game => <RailCard key={game.id} game={game} onOpen={onOpen} />)}
            </GameRail>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

export function LoadoutSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <SafeAreaView accessibilityLabel="Loading Loadout" style={styles.screen}>
      <AppHeader onBack={onBack} />
      <View style={[styles.content, { paddingHorizontal: space[6] }]}>
        <View style={styles.boneTitle} />
        <View style={styles.boneRow} />
        <View style={styles.bonePanel} />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingTop: space[4], paddingBottom: space[10], gap: space[4] },
  eyebrow: {
    fontFamily: face.mono[600],
    fontSize: 10,
    letterSpacing: trackingPx(tracking.wider, 10),
    textTransform: 'uppercase',
    color: colors.accent,
  },
  title: {
    fontFamily: face.display[600],
    fontSize: typeScale['3xl'].size,
    lineHeight: typeScale['3xl'].line,
    color: colors.text,
  },
  stats: { flexDirection: 'row', gap: space[2] },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space[2],
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    backgroundColor: colors.surface,
  },
  statValue: { fontFamily: face.mono[600], fontSize: typeScale.lg.size, lineHeight: typeScale.lg.line, color: colors.text },
  statLabel: { fontFamily: face.body[400], fontSize: typeScale.xs.size, lineHeight: typeScale.xs.line, color: colors.muted },
  stack: { gap: space[2] },
  readout: { padding: space[4], gap: space[3] },
  quote: {
    fontFamily: face.body[400],
    fontStyle: 'italic',
    fontSize: typeScale.lg.size,
    lineHeight: typeScale.lg.line,
    color: colors.text,
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  progressTrack: { flex: 1, height: 6, backgroundColor: colors.surfaceLight, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 999 },
  actions: { gap: space[2] },
  drafted: {
    alignSelf: 'flex-end',
    fontFamily: face.mono[400],
    fontSize: 10,
    letterSpacing: trackingPx(tracking.wider, 10),
    textTransform: 'uppercase',
    color: colors.muted,
  },
  meta: { fontFamily: face.body[400], fontSize: typeScale.xs.size, lineHeight: typeScale.xs.line, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  favorite: { flexGrow: 1, flexBasis: '45%', padding: space[3] },
  favoriteBody: { gap: space[1.5] },
  favoriteName: { fontFamily: face.display[500], fontSize: typeScale.base.size, lineHeight: typeScale.base.line, color: colors.text },
  favoriteScore: { flexDirection: 'row', alignItems: 'baseline', gap: space[1.5] },
  favoriteValue: { fontFamily: face.mono[400], fontSize: typeScale['2xl'].size, lineHeight: typeScale['2xl'].line },
  boneTitle: { height: 28, width: '60%', backgroundColor: colors.surfaceLight, borderRadius: radius.base },
  boneRow: { height: 56, backgroundColor: colors.surfaceLight, borderRadius: radius.base },
  bonePanel: { height: 160, backgroundColor: colors.surfaceLight, borderRadius: radius.base },
})
