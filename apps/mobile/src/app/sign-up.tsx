import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Eyebrow } from '@/components/eyebrow'
import { useAuth } from '@/lib/auth'
import { colors, face, radius, space } from '@/theme'

export default function SignUpScreen() {
  const router = useRouter()
  const { signUp, configured } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit() {
    setError(null)
    setNotice(null)
    setPending(true)
    try {
      const message = await signUp(email.trim(), password)
      if (message) setNotice(message)
      else router.back()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account.')
    } finally {
      setPending(false)
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Eyebrow>ScreenPeak</Eyebrow>
        <Text style={styles.title}>Sign up</Text>
        {configured ? null : <Text style={styles.error}>Sign-up is not configured.</Text>}
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
        <TextInput
          accessibilityLabel="Password"
          autoCapitalize="none"
          autoComplete="new-password"
          placeholder="Password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={styles.input}
        />
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Sign up" disabled={pending || !configured} onPress={() => { void submit() }} style={styles.button}>
          <Text style={styles.buttonText}>{pending ? 'Creating account' : 'Sign up'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Log in" onPress={() => router.replace('/sign-in')}>
          <Text style={styles.link}>Log in</Text>
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
