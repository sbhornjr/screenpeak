// Dropdown triggers and facet pickers the Library tab and the catalogue share.
import type { TaxonomySearchHit } from '@screenpeak/shared/api/search'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronDown } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { colors, face, hitTarget, radius, space, text, typeScale } from '@/theme'

import { Button } from './button'
import { TextField } from './text-field'

/** How long typing pauses before a developer or publisher search goes out. */
export const TAXONOMY_SEARCH_DELAY_MS = 250

export function MenuTrigger({ label, onPress }: { label: string, onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.menuTrigger}>
      <Text numberOfLines={1} style={styles.menuLabel}>{label}</Text>
      <ChevronDown size={16} color={colors.muted} />
    </Pressable>
  )
}

/** The website's direction toggle beside a Sort dropdown. */
export function SortToggle({ order, onToggle }: { order: 'asc' | 'desc', onToggle: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={order === 'desc' ? 'Sort descending — tap for ascending' : 'Sort ascending — tap for descending'}
      onPress={onToggle}
      style={styles.sortToggle}
    >
      {order === 'desc'
        ? <ArrowDownWideNarrow size={18} color={colors.muted} />
        : <ArrowUpNarrowWide size={18} color={colors.muted} />}
    </Pressable>
  )
}

type Option = { id: string, name: string, slug: string }

/** A known set of options, filtered as you type. */
export function FacetPicker({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string
  options: Option[]
  selected: string | null
  onSelect: (slug: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [needle, setNeedle] = useState('')
  if (options.length === 0) return null
  const queryText = needle.trim().toLowerCase()
  const shown = queryText ? options.filter(option => option.name.toLowerCase().includes(queryText)) : options
  const searchLabel = `Search ${label.toLowerCase()}`
  return (
    <View style={styles.stack}>
      <PickerHead
        label={label}
        summary={`${label}: ${selected ? 1 : 0} selected`}
        onToggle={() => setOpen(current => !current)}
        onClear={() => onSelect(null)}
      />
      {open ? (
        <View style={styles.stack}>
          <TextField label={searchLabel} hideLabel placeholder={searchLabel} value={needle} onChangeText={setNeedle} />
          <Options
            options={shown}
            selected={selected}
            onPick={(slug) => {
              onSelect(slug)
              setNeedle('')
              setOpen(false)
            }}
          />
        </View>
      ) : null}
    </View>
  )
}

export type TaxonomySearch = (q: string) => Promise<{ hits: TaxonomySearchHit[] } | { error: string }>

/**
 * Developers and publishers: too many to send with the page, so typing searches
 * the server once the typing pauses. The selected name shows on the trigger.
 */
export function TaxonomyPicker({
  label,
  selected,
  selectedName,
  search,
  onSelect,
}: {
  label: string
  selected: string | null
  selectedName: string | null
  search: TaxonomySearch
  onSelect: (slug: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [needle, setNeedle] = useState('')
  const [result, setResult] = useState<{ q: string, hits: TaxonomySearchHit[] | null, error: string | null } | null>(null)
  const trimmed = needle.trim()

  useEffect(() => {
    if (!open || !trimmed) return
    let live = true
    const timer = setTimeout(() => {
      void search(trimmed).then((answer) => {
        if (!live) return
        setResult('hits' in answer ? { q: trimmed, hits: answer.hits, error: null } : { q: trimmed, hits: null, error: answer.error })
      })
    }, TAXONOMY_SEARCH_DELAY_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [open, trimmed, search])

  const current = result && result.q === trimmed ? result : null
  const searchLabel = `Search ${label.toLowerCase()}`
  return (
    <View style={styles.stack}>
      <PickerHead
        label={label}
        summary={`${label}: ${selectedName ?? selected ?? 'Any'}`}
        onToggle={() => setOpen(value => !value)}
        onClear={() => onSelect(null)}
      />
      {open ? (
        <View style={styles.stack}>
          <TextField label={searchLabel} hideLabel placeholder={searchLabel} value={needle} onChangeText={setNeedle} />
          {!trimmed ? <Text style={styles.emptyMatch}>Type a name.</Text> : null}
          {trimmed && !current ? <ActivityIndicator accessibilityLabel={`Searching ${label.toLowerCase()}`} color={colors.accent} /> : null}
          {current?.error ? <Text accessibilityLiveRegion="polite" style={text.error}>{current.error}</Text> : null}
          {current?.hits ? (
            <Options
              options={current.hits}
              selected={selected}
              onPick={(slug) => {
                onSelect(slug)
                setNeedle('')
                setOpen(false)
              }}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

function PickerHead({ label, summary, onToggle, onClear }: {
  label: string
  summary: string
  onToggle: () => void
  onClear: () => void
}) {
  return (
    <View style={styles.controlRow}>
      <MenuTrigger label={summary} onPress={onToggle} />
      <Button label="Clear" accessibilityLabel={`Clear ${label}`} variant="secondary" onPress={onClear} />
    </View>
  )
}

function Options({ options, selected, onPick }: { options: Option[], selected: string | null, onPick: (slug: string) => void }) {
  if (options.length === 0) return <Text style={styles.emptyMatch}>No matches</Text>
  return (
    <>
      {options.map(option => (
        <Button
          key={option.id}
          label={option.name}
          selected={selected === option.slug}
          variant="secondary"
          onPress={() => onPick(option.slug)}
        />
      ))}
    </>
  )
}

const styles = StyleSheet.create({
  controlRow: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: space[2] },
  menuTrigger: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    minHeight: hitTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[3],
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  menuLabel: {
    flex: 1,
    fontFamily: face.display[600],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.text,
  },
  sortToggle: {
    minWidth: hitTarget,
    minHeight: hitTarget,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stack: { gap: space[2] },
  emptyMatch: {
    fontFamily: face.body[400],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.muted,
  },
})
