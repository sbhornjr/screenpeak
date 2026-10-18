import { useRouter } from 'expo-router'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Eyebrow } from '@/components/eyebrow'
import { useAuth } from '@/lib/auth'
import { backOrHome } from '@/lib/go'
import { leavePasswordScreen, updatePasswordView } from '@/lib/password-reset'
import { readRecovery, subscribeRecovery } from '@/lib/recovery-session'
import { colors, face, radius, space } from '@/theme'

export default function UpdatePasswordScreen() {
  const router = useRouter()
  const { configured, updatePassword, finishPasswordChange, abandonRecovery } = useAuth()
  const recovery = useSyncExternalStore(subscribeRecovery, readRecovery, () => false)
  const updatedRef = useRef(false)
  const recoveryRef = useRef(false)
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const view = updatePasswordView(recovery, done)
  const abandonRef = useRef(abandonRecovery)
  const finishRef = useRef(finishPasswordChange)
  const generation = useRef(0)

  useEffect(() => {
    recoveryRef.current = recovery
  }, [recovery])

  useEffect(() => {
    abandonRef.current = abandonRecovery
    finishRef.current = finishPasswordChange
  })

  useEffect(() => {
    const mine = generation.current + 1
    generation.current = mine
    return () => {
      const snapshot = { recovery: recoveryRef.current, updated: updatedRef.current }
      queueMicrotask(() => {
        if (generation.current !== mine) return
        void leavePasswordScreen(snapshot, () => abandonRef.current()).then((action) => {
          if (action === 'keep' && snapshot.updated) finishRef.current()
        })
      })
    }
  }, [])

  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => router.replace('/'), 1400)
    return () => clearTimeout(timer)
  }, [done, router])

  async function submit() {
    setError(null)
    setPending(true)
    try {
      await updatePassword(password, again)
      updatedRef.current = true
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the password.')
    } finally {
      setPending(false)
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Eyebrow>ScreenPeak</Eyebrow>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={backOrHome}>
          <Text style={styles.link}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Set a new password</Text>
        {configured ? null : <Text style={styles.error}>Sign-in is not configured.</Text>}
        {!view.form ? <Text style={styles.body}>{view.message}</Text> : null}
        {!view.form && !done ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Request a new link" onPress={() => router.push('/forgot-password')}>
            <Text style={styles.link}>Request a new link</Text>
          </Pressable>
        ) : null}
        {view.form ? (
          <>
            <TextInput
              accessibilityLabel="New password"
              autoCapitalize="none"
              autoComplete="new-password"
              placeholder="New password"
              placeholderTextColor={colors.muted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              style={styles.input}
            />
            <TextInput
              accessibilityLabel="Confirm new password"
              autoCapitalize="none"
              autoComplete="new-password"
              placeholder="Confirm new password"
              placeholderTextColor={colors.muted}
              secureTextEntry
              value={again}
              onChangeText={setAgain}
              style={styles.input}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Update password"
              disabled={pending || !configured}
              onPress={() => { void submit() }}
              style={styles.button}
            >
              <Text style={styles.buttonText}>{pending ? 'Saving…' : 'Update password'}</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[6], paddingTop: space[8], gap: space[3] },
  title: { fontFamily: face.display[600], fontSize: 32, color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: face.body[400],
    fontSize: 16,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.base,
    paddingVertical: space[3],
    alignItems: 'center',
  },
  buttonText: { fontFamily: face.body[600], fontSize: 16, color: colors.bg },
  body: { fontFamily: face.body[400], fontSize: 16, lineHeight: 22, color: colors.text },
  error: { fontFamily: face.body[400], fontSize: 14, color: colors.bad },
  link: { fontFamily: face.body[500], fontSize: 14, color: colors.accent },
})
