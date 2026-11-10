import { useRouter } from 'expo-router'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Text } from 'react-native'

import { AuthScaffold } from '@/components/auth-scaffold'
import { Button } from '@/components/button'
import { TextField } from '@/components/text-field'
import { authConfigError } from '@/lib/auth-config'
import { useAuth } from '@/lib/auth'
import { leavePasswordScreen, updatePasswordView } from '@/lib/password-reset'
import { readRecovery, subscribeRecovery } from '@/lib/recovery-session'
import { text } from '@/theme'

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
    <AuthScaffold title="Set a new password">
      {configured ? null : <Text style={text.error}>{authConfigError()}</Text>}
      {!view.form ? <Text style={text.notice}>{view.message}</Text> : null}
      {!view.form && !done ? (
        <Button label="Request a new link" variant="ghost" onPress={() => router.push('/forgot-password')} />
      ) : null}
      {view.form ? (
        <>
          <TextField
            label="New password"
            placeholder="New password"
            autoCapitalize="none"
            autoComplete="new-password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <TextField
            label="Confirm new password"
            placeholder="Confirm new password"
            autoCapitalize="none"
            autoComplete="new-password"
            secureTextEntry
            value={again}
            onChangeText={setAgain}
          />
          {error ? <Text style={text.error}>{error}</Text> : null}
          <Button
            label={pending ? 'Saving…' : 'Update password'}
            accessibilityLabel="Update password"
            disabled={pending || !configured}
            onPress={() => { void submit() }}
          />
        </>
      ) : null}
    </AuthScaffold>
  )
}
