import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Eyebrow } from '@/components/eyebrow'
import { useAuth } from '@/lib/auth'
import { backOrHome } from '@/lib/go'
import { RESET_LINK_HINT } from '@/lib/password-reset'
import { supabase } from '@/lib/supabase'
import { colors, face, radius, space } from '@/theme'

export default function UpdatePasswordScreen() {
  const router = useRouter()
  const { ready, session, configured, updatePassword } = useAuth()
  const [storedSession, setStoredSession] = useState<boolean | null>(null)
  const hasSession = Boolean(session) || storedSession === true
  const checked = !ready ? false : Boolean(session) || !supabase || storedSession !== null
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!ready || session || !supabase) return
    let live = true
    supabase.auth.getSession().then(({ data }) => {
      if (!live) return
      setStoredSession(Boolean(data.session))
    })
    return () => { live = false }
  }, [ready, session])

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
        {!checked ? <Text style={styles.body}>Checking your link…</Text> : null}
        {checked && !hasSession ? (
          <>
            <Text style={styles.body}>{RESET_LINK_HINT}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Request a new link" onPress={() => router.push('/forgot-password')}>
              <Text style={styles.link}>Request a new link</Text>
            </Pressable>
          </>
        ) : null}
        {done ? <Text style={styles.body}>Password updated. Taking you home…</Text> : null}
        {checked && hasSession && !done ? (
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
