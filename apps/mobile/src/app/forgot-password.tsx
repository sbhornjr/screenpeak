import { useEffect, useState } from 'react'
import { Text } from 'react-native'

import { AuthScaffold, authText } from '@/components/auth-scaffold'
import { Button } from '@/components/button'
import { TextField } from '@/components/text-field'
import { useAuth } from '@/lib/auth'
import { resetCooldownRemaining } from '@/lib/password-reset'

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
    <AuthScaffold title="Reset password">
      {configured ? null : <Text style={authText.error}>Sign-in is not configured.</Text>}
      <TextField
        label="Email"
        placeholder="Email"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      {confirmation ? <Text style={authText.notice}>{confirmation}</Text> : null}
      {error ? <Text style={authText.error}>{error}</Text> : null}
      <Button
        label={pending ? 'Sending…' : 'Send reset link'}
        accessibilityLabel="Send reset link"
        disabled={pending || remaining > 0 || !configured}
        onPress={() => { void submit() }}
      />
    </AuthScaffold>
  )
}
