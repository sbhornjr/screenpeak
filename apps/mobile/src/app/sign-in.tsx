import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Eyebrow } from '@/components/eyebrow'
import { useAuth } from '@/lib/auth'
import { backOrHome } from '@/lib/go'
import { colors, face, radius, space } from '@/theme'

export default function SignInScreen() {
  const router = useRouter()
  const { signIn, configured } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit() {
    setError(null)
    setPending(true)
    try {
      await signIn(email.trim(), password)
      backOrHome()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log in.')
    } finally {
      setPending(false)
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Eyebrow>ScreenPeak</Eyebrow>
        <Text style={styles.title}>Log in</Text>
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
        <TextInput
          accessibilityLabel="Password"
          autoCapitalize="none"
          autoComplete="password"
          placeholder="Password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={styles.input}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Log in" disabled={pending || !configured} onPress={() => { void submit() }} style={styles.button}>
          <Text style={styles.buttonText}>{pending ? 'Logging in' : 'Log in'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Create an account" onPress={() => router.replace('/sign-up')}>
          <Text style={styles.link}>Create an account</Text>
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
  error: { fontFamily: face.body[400], fontSize: 14, color: colors.bad },
  link: { fontFamily: face.body[500], fontSize: 14, color: colors.accent },
})
