import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Text } from 'react-native'

import { AuthScaffold } from '@/components/auth-scaffold'
import { Button } from '@/components/button'
import { TextField } from '@/components/text-field'
import { authConfigError } from '@/lib/auth-config'
import { useAuth } from '@/lib/auth'
import { back } from '@/lib/go'
import { text } from '@/theme'

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
      back()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log in.')
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthScaffold title="Log in">
      {configured ? null : <Text style={text.error}>{authConfigError()}</Text>}
      <TextField
        label="Email"
        placeholder="Email"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextField
        label="Password"
        placeholder="Password"
        autoCapitalize="none"
        autoComplete="password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error ? <Text style={text.error}>{error}</Text> : null}
      <Button label={pending ? 'Logging in' : 'Log in'} accessibilityLabel="Log in" disabled={pending || !configured} onPress={() => { void submit() }} />
      <Button label="Forgot password?" variant="ghost" onPress={() => router.push('/forgot-password')} />
      <Button label="Create an account" variant="ghost" onPress={() => router.replace('/sign-up')} />
    </AuthScaffold>
  )
}
