// Port of apps/web/app/settings/page.tsx, plus the profile page's title and bio
// editors (TitleSelectButton, BioButton), which the phone keeps here. Steam
// linking is a later screen.
import type { SettingsData } from '@screenpeak/shared/api/me'
import { useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useAction } from '@/lib/use-action'
import { useOnOpen } from '@/lib/use-on-open'
import {
  bioProblem,
  memberSinceLine,
  passwordChangeProblem,
  PRIVACY_ROWS,
  shownTitle,
  usernameProblem,
  type PrivacyType,
} from '@/lib/settings-page'
import { colors, face, space, text, tracking, trackingPx, typeScale } from '@/theme'

import { ActionError } from './action-error'
import { AppHeader } from './app-header'
import { Avatar } from './avatar'
import { Button } from './button'
import { Panel } from './panel'
import { Sheet } from './sheet'
import { SwitchRow } from './switch-row'
import { TextField } from './text-field'

type Write = () => Promise<string | null>

const BIO_MAX = 500

export type SettingsScreenProps = {
  settings: SettingsData
  bio: string
  titles: string[]
  onBack: () => void
  /** Each resolves to null, or the sentence to show. */
  onChangePhoto: Write
  onSaveTitle: (title: string) => Promise<string | null>
  onSaveBio: (bio: string) => Promise<string | null>
  onSaveUsername: (username: string) => Promise<string | null>
  onChangeEmail: (email: string) => Promise<{ ok: boolean, message: string }>
  onChangePassword: (current: string, next: string, again: string) => Promise<string | null>
  onPrivacy: (type: PrivacyType, value: boolean) => Promise<string | null>
  onSignOut: Write
  onDeleteAccount: Write
  refreshing?: boolean
  onRefresh?: () => void
  refreshError?: string | null
  onRetry?: () => void
}

type Editing = null | 'title' | 'bio' | 'username' | 'email' | 'password' | 'delete'

function Section({ title, children, danger = false }: { title: string, children: React.ReactNode, danger?: boolean }) {
  return (
    <Panel style={[styles.section, danger && styles.danger]}>
      <Text role="heading" accessibilityRole="header" accessibilityLevel={2} style={styles.sectionTitle}>{title}</Text>
      {children}
    </Panel>
  )
}

/** A label, its current value, and the button that edits it. */
function Row({ label, value, action, onPress }: { label: string, value: string, action: string, onPress: () => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text numberOfLines={3} style={styles.rowValue}>{value}</Text>
      </View>
      <Button label={action} accessibilityLabel={`${action} ${label.toLowerCase()}`} variant="secondary" onPress={onPress} />
    </View>
  )
}

function TitleSheet({ visible, current, titles, onClose, onSave }: {
  visible: boolean
  current: string | null
  titles: string[]
  onClose: () => void
  onSave: (title: string) => Promise<string | null>
}) {
  const save = useAction()
  useOnOpen(visible, save.clear)
  return (
    <Sheet visible={visible} title="Select title" onClose={onClose}>
      <ActionError error={save.error} />
      {titles.map(title => (
        <Button
          key={title}
          label={title}
          variant="secondary"
          selected={title === current}
          disabled={save.busy}
          onPress={() => { void save.run(() => onSave(title), onClose) }}
        />
      ))}
    </Sheet>
  )
}

function BioSheet({ visible, current, onClose, onSave }: {
  visible: boolean
  current: string
  onClose: () => void
  onSave: (bio: string) => Promise<string | null>
}) {
  const [bio, setBio] = useState(current)
  const save = useAction()
  useOnOpen(visible, () => {
    setBio(current)
    save.clear()
  })
  function submit() {
    const problem = bioProblem(bio)
    if (problem) return save.fail(problem)
    void save.run(() => onSave(bio), onClose)
  }
  return (
    <Sheet visible={visible} title="Edit bio" onClose={onClose}>
      <TextField label="Bio" value={bio} onChangeText={setBio} multiline />
      <Text style={[styles.count, bio.length > BIO_MAX && styles.over]}>{`${bio.length}/${BIO_MAX}`}</Text>
      <ActionError error={save.error} onRetry={save.canRetry ? save.retry : undefined} />
      <Button label={save.busy ? 'Saving…' : 'Save bio'} disabled={save.busy} onPress={submit} />
    </Sheet>
  )
}

function UsernameSheet({ visible, current, onClose, onSave }: {
  visible: boolean
  current: string
  onClose: () => void
  onSave: (username: string) => Promise<string | null>
}) {
  const [username, setUsername] = useState(current)
  const save = useAction()
  useOnOpen(visible, () => {
    setUsername(current)
    save.clear()
  })
  function submit() {
    const problem = usernameProblem(username, current)
    if (problem) return save.fail(problem)
    void save.run(() => onSave(username.trim()), onClose)
  }
  return (
    <Sheet visible={visible} title="Change username" onClose={onClose}>
      <TextField
        label="New username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoComplete="username"
        onSubmitEditing={submit}
      />
      <Text style={text.muted}>3–20 letters, numbers, or underscores. Links to your old username stop working.</Text>
      <ActionError error={save.error} onRetry={save.canRetry ? save.retry : undefined} />
      <Button label={save.busy ? 'Saving…' : 'Save username'} disabled={save.busy} onPress={submit} />
    </Sheet>
  )
}

function EmailSheet({ visible, current, onClose, onChange }: {
  visible: boolean
  current: string | null
  onClose: () => void
  onChange: (email: string) => Promise<{ ok: boolean, message: string }>
}) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<string | null>(null)
  const save = useAction()
  useOnOpen(visible, () => {
    setEmail('')
    setSent(null)
    save.clear()
  })
  function submit() {
    void save.run(async () => {
      const result = await onChange(email)
      if (!result.ok) return result.message
      setSent(result.message)
      return null
    })
  }
  return (
    <Sheet visible={visible} title="Change email" onClose={onClose}>
      {sent ? (
        <>
          <Text accessibilityLiveRegion="polite" style={text.body}>{sent}</Text>
          <Button label="Done" onPress={onClose} />
        </>
      ) : (
        <>
          {current ? <Text style={text.muted}>{`Current email: ${current}`}</Text> : null}
          <TextField
            label="New email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            onSubmitEditing={submit}
          />
          <ActionError error={save.error} />
          <Button label={save.busy ? 'Sending…' : 'Send confirmation link'} disabled={save.busy} onPress={submit} />
        </>
      )}
    </Sheet>
  )
}

function PasswordSheet({ visible, onClose, onChange }: {
  visible: boolean
  onClose: () => void
  onChange: (current: string, next: string, again: string) => Promise<string | null>
}) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [done, setDone] = useState(false)
  const save = useAction()
  useOnOpen(visible, () => {
    setCurrent('')
    setNext('')
    setAgain('')
    setDone(false)
    save.clear()
  })
  function submit() {
    const problem = passwordChangeProblem(current, next, again)
    if (problem) return save.fail(problem)
    void save.run(() => onChange(current, next, again), () => setDone(true))
  }
  return (
    <Sheet visible={visible} title="Change password" onClose={onClose}>
      {done ? (
        <>
          <Text accessibilityLiveRegion="polite" style={text.body}>Password changed.</Text>
          <Button label="Done" onPress={onClose} />
        </>
      ) : (
        <>
          <TextField label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
          <TextField label="New password" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" />
          <TextField
            label="Confirm new password"
            value={again}
            onChangeText={setAgain}
            secureTextEntry
            autoComplete="new-password"
            onSubmitEditing={submit}
          />
          <ActionError error={save.error} />
          <Button label={save.busy ? 'Saving…' : 'Change password'} disabled={save.busy} onPress={submit} />
        </>
      )}
    </Sheet>
  )
}

function DeleteSheet({ visible, onClose, onDelete }: { visible: boolean, onClose: () => void, onDelete: Write }) {
  const remove = useAction()
  useOnOpen(visible, remove.clear)
  return (
    <Sheet visible={visible} title="Delete your account?" onClose={onClose}>
      <Text style={text.body}>This permanently deletes your account and all your data. This cannot be undone.</Text>
      <ActionError error={remove.error} />
      <Button label="Keep my account" variant="secondary" onPress={onClose} />
      <Button
        label={remove.busy ? 'Deleting…' : 'Delete account'}
        variant="danger"
        disabled={remove.busy}
        onPress={() => { void remove.run(onDelete) }}
      />
    </Sheet>
  )
}

export function SettingsScreen({
  settings,
  bio,
  titles,
  onBack,
  onChangePhoto,
  onSaveTitle,
  onSaveBio,
  onSaveUsername,
  onChangeEmail,
  onChangePassword,
  onPrivacy,
  onSignOut,
  onDeleteAccount,
  refreshing = false,
  onRefresh,
  refreshError = null,
  onRetry,
}: SettingsScreenProps) {
  const { width } = useWindowDimensions()
  const inset = width <= 375 ? space[4] : space[6]
  const [editing, setEditing] = useState<Editing>(null)
  const photo = useAction()
  const privacy = useAction()
  const signOut = useAction()
  const since = memberSinceLine(settings.created_at)
  const close = () => setEditing(null)

  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader onBack={onBack} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: inset }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} /> : undefined}
      >
        <Text style={styles.eyebrow}>System</Text>
        <Text role="heading" accessibilityRole="header" accessibilityLevel={1} style={styles.title}>Settings</Text>
        {refreshError ? (
          <View style={styles.stack}>
            <Text accessibilityLiveRegion="polite" style={text.error}>{refreshError}</Text>
            {onRetry ? <Button label="Retry" variant="secondary" onPress={onRetry} /> : null}
          </View>
        ) : null}

        <View style={styles.identity}>
          <Avatar src={settings.avatar_url} alt={settings.username} size="lg" />
          <View style={styles.identityText}>
            <Text numberOfLines={1} style={styles.username}>{settings.username}</Text>
            <Text numberOfLines={2} style={styles.titleLine}>{shownTitle(settings.selected_title)}</Text>
            {since ? <Text style={text.muted}>{since}</Text> : null}
          </View>
        </View>
        <Button
          label={photo.busy ? 'Uploading…' : 'Change photo'}
          variant="secondary"
          disabled={photo.busy}
          onPress={() => { void photo.run(onChangePhoto) }}
        />
        <ActionError error={photo.error} />

        <Section title="Profile">
          <Row label="Title" value={shownTitle(settings.selected_title)} action="Change" onPress={() => setEditing('title')} />
          <Row label="Bio" value={bio || "You haven't written a bio yet."} action="Edit" onPress={() => setEditing('bio')} />
        </Section>

        <Section title="Account">
          <Row label="Username" value={settings.username} action="Change" onPress={() => setEditing('username')} />
          <Row label="Email" value={settings.email ?? '—'} action="Change" onPress={() => setEditing('email')} />
          <Row label="Password" value="••••••••" action="Change" onPress={() => setEditing('password')} />
        </Section>

        <Section title="Privacy">
          {PRIVACY_ROWS.map(row => (
            <SwitchRow
              key={row.type}
              label={row.label}
              accessibilityLabel={`${row.label} public`}
              value={settings[row.key]}
              states={['Private', 'Public']}
              disabled={privacy.busy}
              onChange={value => { void privacy.run(() => onPrivacy(row.type, value)) }}
            />
          ))}
          <ActionError error={privacy.error} />
        </Section>

        <Button
          label={signOut.busy ? 'Signing out…' : 'Sign out'}
          variant="secondary"
          disabled={signOut.busy}
          onPress={() => { void signOut.run(onSignOut) }}
        />
        <ActionError error={signOut.error} />

        <Section title="Danger zone" danger>
          <Text style={text.muted}>
            Deleting your account is permanent. Your library, ratings, reviews, and lists cannot be recovered.
          </Text>
          <Button label="Delete account" variant="danger" onPress={() => setEditing('delete')} />
        </Section>
      </ScrollView>

      <TitleSheet visible={editing === 'title'} current={settings.selected_title} titles={titles} onClose={close} onSave={onSaveTitle} />
      <BioSheet visible={editing === 'bio'} current={bio} onClose={close} onSave={onSaveBio} />
      <UsernameSheet visible={editing === 'username'} current={settings.username} onClose={close} onSave={onSaveUsername} />
      <EmailSheet visible={editing === 'email'} current={settings.email} onClose={close} onChange={onChangeEmail} />
      <PasswordSheet visible={editing === 'password'} onClose={close} onChange={onChangePassword} />
      <DeleteSheet visible={editing === 'delete'} onClose={close} onDelete={onDeleteAccount} />
    </SafeAreaView>
  )
}

export function SettingsSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <SafeAreaView accessibilityLabel="Loading settings" style={styles.screen}>
      <AppHeader onBack={onBack} />
      <View style={[styles.content, { paddingHorizontal: space[6] }]}>
        <View style={styles.boneTitle} />
        <View style={styles.identity}>
          <View style={styles.boneAvatar} />
          <View style={styles.boneLine} />
        </View>
        <View style={styles.bonePanel} />
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
  stack: { gap: space[2] },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  identityText: { flex: 1, minWidth: 0, gap: space[0.5] },
  username: { fontFamily: face.display[600], fontSize: typeScale['2xl'].size, lineHeight: typeScale['2xl'].line, color: colors.text },
  titleLine: { fontFamily: face.body[600], fontSize: typeScale.sm.size, lineHeight: typeScale.sm.line, color: colors.muted },
  section: { padding: space[4], gap: space[3] },
  danger: { borderColor: colors.bad },
  sectionTitle: { fontFamily: face.display[600], fontSize: typeScale.xl.size, lineHeight: typeScale.xl.line, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  rowText: { flex: 1, minWidth: 0, gap: space[0.5] },
  rowLabel: { fontFamily: face.body[400], fontSize: typeScale.sm.size, lineHeight: typeScale.sm.line, color: colors.muted },
  rowValue: { fontFamily: face.body[400], fontSize: typeScale.base.size, lineHeight: typeScale.base.line, color: colors.text },
  count: { alignSelf: 'flex-end', fontFamily: face.mono[400], fontSize: typeScale.xs.size, color: colors.muted },
  over: { color: colors.bad },
  boneTitle: { height: 32, width: '50%', backgroundColor: colors.surfaceLight },
  boneAvatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceLight },
  boneLine: { flex: 1, height: 24, backgroundColor: colors.surfaceLight },
  bonePanel: { height: 140, backgroundColor: colors.surfaceLight },
})
