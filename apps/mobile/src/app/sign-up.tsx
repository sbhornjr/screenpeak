import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Text } from 'react-native'

import { parseOrError, usernameSchema } from '@screenpeak/shared/schemas'

import { AuthScaffold, authText } from '@/components/auth-scaffold'
import { Button } from '@/components/button'
import { TextField } from '@/components/text-field'
import { useAuth } from '@/lib/auth'
import { backOrHome } from '@/lib/go'

export default function SignUpScreen() {
  const router = useRouter()
  const { signUp, configured } = useAuth()
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit() {
    setError(null)
    setNotice(null)
    const usernameCheck = parseOrError(usernameSchema, username)
    if (!usernameCheck.success) {
      setError(usernameCheck.error)
      return
    }
    setPending(true)
    try {
      const message = await signUp(email.trim(), password, usernameCheck.data)
      if (message) setNotice(message)
      else backOrHome()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account.')
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthScaffold title="Sign up">
      {configured ? null : <Text style={authText.error}>Sign-up is not configured.</Text>}
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
        label="Username"
        placeholder="Username"
        autoCapitalize="none"
        autoComplete="username"
        value={username}
        onChangeText={setUsername}
      />
      <TextField
        label="Password"
        placeholder="Password"
        autoCapitalize="none"
        autoComplete="new-password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {notice ? <Text style={authText.notice}>{notice}</Text> : null}
      {error ? <Text style={authText.error}>{error}</Text> : null}
      <Button label={pending ? 'Creating account' : 'Sign up'} accessibilityLabel="Sign up" disabled={pending || !configured} onPress={() => { void submit() }} />
      <Button label="Log in" variant="ghost" onPress={() => router.replace('/sign-in')} />
    </AuthScaffold>
  )
}
