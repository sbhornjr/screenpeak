// The website's /steamlink: matched Steam games to review, edit, and import.
import { releaseYear } from '@screenpeak/shared/dates'
import type { SteamLinkEntry } from '@screenpeak/shared/types'
import { Image } from 'expo-image'
import { useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { igdbImageUri } from '@/lib/catalog-image'
import { LIBRARY_CHOICES } from '@/lib/game-page'
import { applySteamEdit, editForm, entrySummary, type SteamEditField, type SteamEditForm } from '@/lib/steam-import'
import { useOnOpen } from '@/lib/use-on-open'
import { colors, face, radius, space, text, tracking, trackingPx, typeScale } from '@/theme'

import { AppHeader } from './app-header'
import { Button } from './button'
import { EmptyState } from './empty-state'
import { Sheet } from './sheet'
import { TextField } from './text-field'

export type SteamImportScreenProps = {
  entries: SteamLinkEntry[]
  /** The website's matching sentence. */
  line: string
  notice: string | null
  error: string | null
  matching: boolean
  importing: boolean
  /** "Try the remaining matches again" shows when apps are left to check. */
  canRetryMatches: boolean
  onRetryMatches: () => void
  onToggle: (gameId: string) => void
  onEdit: (entry: SteamLinkEntry, fields: SteamEditField[]) => void
  onImport: () => void
  onBack: () => void
}

const INTRO = 'Match your Steam library, then choose what to add. Your ScreenPeak library does not change until you import. Games already in it keep what you set, including hours played.'

function Heading() {
  return (
    <>
      <Text style={styles.eyebrow}>Connections</Text>
      <Text role="heading" accessibilityRole="header" accessibilityLevel={1} style={styles.title}>Import from Steam</Text>
    </>
  )
}

function GameRow({ entry, onToggle, onEdit }: { entry: SteamLinkEntry, onToggle: () => void, onEdit: () => void }) {
  const cover = igdbImageUri(entry.coverImageUrl)
  const meta = [entry.gameDeveloper, releaseYear(entry.gameReleased)].filter(Boolean).join(' · ')
  return (
    <View style={[styles.row, entry.selected && styles.rowSelected]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`${entry.selected ? 'Deselect' : 'Select'} ${entry.gameName}`}
        accessibilityState={{ checked: entry.selected }}
        onPress={onToggle}
        style={styles.pick}
      >
        <View style={[styles.box, entry.selected && styles.boxOn]}>
          {entry.selected ? <Text style={styles.tick}>✓</Text> : null}
        </View>
        <View style={styles.cover}>
          {cover ? <Image source={cover} recyclingKey={entry.gameId} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        </View>
        <View style={styles.body}>
          <Text numberOfLines={2} style={styles.name}>{entry.gameName}</Text>
          {meta ? <Text numberOfLines={1} style={styles.meta}>{meta}</Text> : null}
          {/* Two lines: Completed, Abandoned, and Playing push "Played N×" past one line at 375pt. */}
          <Text numberOfLines={2} style={styles.summary}>{entrySummary(entry)}</Text>
        </View>
      </Pressable>
      <Button label="Edit" accessibilityLabel={`Edit ${entry.gameName}`} variant="ghost" onPress={onEdit} />
    </View>
  )
}

function EditSheet({ entry, onClose, onSave }: {
  entry: SteamLinkEntry | null
  onClose: () => void
  onSave: (entry: SteamLinkEntry, fields: SteamEditField[]) => void
}) {
  const visible = entry != null
  const [form, setForm] = useState<SteamEditForm | null>(entry ? editForm(entry) : null)
  const [error, setError] = useState<string | null>(null)

  useOnOpen(visible, () => {
    setForm(entry ? editForm(entry) : null)
    setError(null)
  })

  function done() {
    if (!entry || !form) return
    const result = applySteamEdit(entry, form)
    if (!result.ok) {
      setError(result.message)
      return
    }
    if (result.fields.length > 0) onSave(result.entry, result.fields)
    onClose()
  }

  return (
    <Sheet visible={visible} title={entry?.gameName ?? 'Edit game'} onClose={onClose}>
      {form ? (
        <>
          {LIBRARY_CHOICES.map(choice => {
            const selected = form.status === choice.status
            return (
              <Pressable
                key={choice.status}
                accessibilityRole="button"
                accessibilityLabel={`Log as ${choice.status}`}
                accessibilityState={{ selected }}
                onPress={() => setForm({ ...form, status: choice.status })}
                style={[styles.option, selected && styles.optionSelected]}
              >
                <Text style={styles.optionTitle}>{choice.label}</Text>
                <Text style={text.caption}>{choice.description}</Text>
              </Pressable>
            )
          })}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="100% achievements completed"
            accessibilityState={{ checked: form.completed }}
            onPress={() => setForm({ ...form, completed: !form.completed })}
            style={[styles.option, form.completed && styles.optionSelected]}
          >
            <Text style={text.body}>100% achievements completed</Text>
            <Text style={text.caption}>{form.completed ? 'On' : 'Off'}</Text>
          </Pressable>
          <TextField
            label="Hours played"
            value={form.hours}
            onChangeText={hours => setForm({ ...form, hours })}
            keyboardType="decimal-pad"
          />
          <Text style={styles.metaLabel}>Times played</Text>
          <View style={styles.stepper}>
            <Button
              label="−"
              accessibilityLabel="Fewer times played"
              variant="secondary"
              onPress={() => setForm({ ...form, timesPlayed: Math.max(1, form.timesPlayed - 1) })}
            />
            <Text style={styles.playCount}>{form.timesPlayed}</Text>
            <Button
              label="+"
              accessibilityLabel="More times played"
              variant="secondary"
              onPress={() => setForm({ ...form, timesPlayed: Math.min(32767, form.timesPlayed + 1) })}
            />
          </View>
        </>
      ) : null}
      {error ? <Text accessibilityLiveRegion="polite" style={text.error}>{error}</Text> : null}
      <Button label="Done" onPress={done} />
    </Sheet>
  )
}

export function SteamImportScreen({
  entries,
  line,
  notice,
  error,
  matching,
  importing,
  canRetryMatches,
  onRetryMatches,
  onToggle,
  onEdit,
  onImport,
  onBack,
}: SteamImportScreenProps) {
  const { width } = useWindowDimensions()
  const inset = width <= 375 ? space[4] : space[6]
  const [editing, setEditing] = useState<string | null>(null)
  const selectedCount = entries.filter(entry => entry.selected).length
  const editingEntry = entries.find(entry => entry.gameId === editing) ?? null

  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader onBack={onBack} />
      <FlatList
        data={entries}
        keyExtractor={entry => entry.gameId}
        contentContainerStyle={[styles.list, { paddingHorizontal: inset }]}
        ListHeaderComponent={(
          <View style={styles.header}>
            <Heading />
            <Text style={text.body}>{INTRO}</Text>
            <Text accessibilityLiveRegion="polite" style={text.muted}>{line}</Text>
            {notice ? <Text accessibilityLiveRegion="polite" style={text.error}>{notice}</Text> : null}
            {canRetryMatches ? <Button label="Try the remaining matches again" variant="secondary" onPress={onRetryMatches} /> : null}
          </View>
        )}
        ListEmptyComponent={matching ? undefined : (
          <EmptyState dense title="No games to import" description="None of your Steam apps matched a game in the catalogue yet." />
        )}
        renderItem={({ item }) => (
          <GameRow entry={item} onToggle={() => onToggle(item.gameId)} onEdit={() => setEditing(item.gameId)} />
        )}
      />
      <View style={[styles.footer, { paddingHorizontal: inset }]}>
        {error ? <Text accessibilityLiveRegion="polite" style={text.error}>{error}</Text> : null}
        <Button
          label={importing ? 'Importing…' : `Import games (${selectedCount})`}
          disabled={importing || matching || selectedCount === 0}
          onPress={onImport}
        />
      </View>
      <EditSheet entry={editingEntry} onClose={() => setEditing(null)} onSave={onEdit} />
    </SafeAreaView>
  )
}

/** /steamlink before Steam is linked, or after it was unlinked elsewhere. */
export function SteamImportUnlinked({ onBack, onOpenSettings }: { onBack: () => void, onOpenSettings: () => void }) {
  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader onBack={onBack} />
      <View style={[styles.list, styles.header, { paddingHorizontal: space[6] }]}>
        <Heading />
        <EmptyState dense title="Link Steam in Settings to import your games." />
        <Button label="Open Settings" onPress={onOpenSettings} />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { paddingTop: space[4], paddingBottom: space[6], gap: space[3] },
  header: { gap: space[3], paddingBottom: space[2] },
  eyebrow: {
    fontFamily: face.mono[600],
    fontSize: 10,
    letterSpacing: trackingPx(tracking.wider, 10),
    textTransform: 'uppercase',
    color: colors.muted,
  },
  title: {
    fontFamily: face.display[600],
    fontSize: typeScale['3xl'].size,
    lineHeight: typeScale['3xl'].line,
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    backgroundColor: colors.surface,
    paddingLeft: space[3],
    paddingVertical: space[2],
  },
  rowSelected: { borderColor: colors.accent },
  pick: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space[3] },
  box: {
    width: 20,
    height: 20,
    borderRadius: radius.base,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  tick: { fontFamily: face.mono[600], fontSize: 12, lineHeight: 14, color: colors.bg },
  cover: { width: 40, aspectRatio: 3 / 4, borderRadius: radius.base, overflow: 'hidden', backgroundColor: colors.surfaceLight },
  body: { flex: 1, minWidth: 0, gap: space[0.5] },
  name: { fontFamily: face.display[600], fontSize: typeScale.sm.size, lineHeight: typeScale.sm.line, color: colors.text },
  meta: { fontFamily: face.body[400], fontSize: typeScale.xs.size, lineHeight: typeScale.xs.line, color: colors.muted },
  summary: { fontFamily: face.mono[400], fontSize: typeScale.xs.size, lineHeight: typeScale.xs.line, color: colors.text },
  footer: {
    gap: space[2],
    paddingTop: space[3],
    paddingBottom: space[3],
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    gap: space[1],
    backgroundColor: colors.surface,
  },
  optionSelected: { borderColor: colors.accent },
  optionTitle: { fontFamily: face.display[600], fontSize: typeScale.base.size, color: colors.text },
  metaLabel: { fontFamily: face.mono[400], fontSize: typeScale.eyebrow.size, color: colors.muted },
  stepper: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], alignItems: 'center' },
  playCount: {
    minWidth: 32,
    fontFamily: face.mono[600],
    fontSize: typeScale.lg.size,
    color: colors.text,
    textAlign: 'center',
  },
})
