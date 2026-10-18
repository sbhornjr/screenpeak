import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Eyebrow } from '@/components/eyebrow'
import { useAuth } from '@/lib/auth'
import { backOrHome } from '@/lib/go'
import { resetCooldownRemaining } from '@/lib/password-reset'
import { colors, face, radius, space } from '@/theme'

export default function ForgotPasswordScreen() {
  const { requestPasswordReset, configured, resetSentAt } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const remaining = resetCooldownRemaining(resetSentAt, now)

  useEffect(() => {
    if (remaining <= 0) return
    const timer = setTimeout(() => setNow(Date.now()), remaining)
    return () => clearTimeout(timer)
  }, [remaining])

  async function submit() {
    setError(null)
    setPending(true)
    try {
      const result = await requestPasswordReset(email)
      if ('error' in result) {
        setError(result.error)
        return
      }
      setConfirmation(result.confirmation)
      setNow(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a reset link.')
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
        <Text style={styles.title}>Reset password</Text>
        {configured ? null : <Text style={styles.error}>Sign-in is not configured.</Text>}
        <TextInput
          accessibilityLabel="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor={colors.muted}
          value={email}
          onChangeText={setEmail}
          style={styles.input}
        />
        {confirmation ? <Text style={styles.notice}>{confirmation}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send reset link"
          disabled={pending || remaining > 0 || !configured}
          onPress={() => { void submit() }}
          style={styles.button}
        >
          <Text style={styles.buttonText}>{pending ? 'Sending…' : 'Send reset link'}</Text>
        </Pressable>
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
  notice: { fontFamily: face.body[400], fontSize: 14, lineHeight: 20, color: colors.text },
  error: { fontFamily: face.body[400], fontSize: 14, color: colors.bad },
  link: { fontFamily: face.body[500], fontSize: 14, color: colors.accent },
})
