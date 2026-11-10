import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { createMobileClient, sendPasswordReset } from './mobile-client'

const redirectTo = 'http://localhost:8081/auth/confirm?next=/auth/update-password'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: async (key: string) => map.get(key) ?? null,
    setItem: async (key: string, value: string) => { map.set(key, value) },
    removeItem: async (key: string) => { map.delete(key) },
    map,
  }
}

function clientRecording(storage: ReturnType<typeof memoryStorage>) {
  const calls: { url: string, body: Record<string, unknown> | null }[] = []
  const client = createMobileClient('http://127.0.0.1:9', 'anon-key', storage, async (input, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null
    calls.push({ url: String(input), body })
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  return { client, calls }
}

describe('mobile auth flows', () => {
  it('sign-up confirmation does not send a code challenge', async () => {
    const storage = memoryStorage()
    const { client, calls } = clientRecording(storage)
    await client.auth.signUp({
      email: 'person@example.com',
      password: 'longpass',
      options: { data: { username: 'person' } },
    })
    const signup = calls.find((call) => call.url.includes('/signup'))
    expect(signup?.body).toEqual({
      email: 'person@example.com',
      password: 'longpass',
      data: { username: 'person' },
      code_challenge: null,
      code_challenge_method: null,
      gotrue_meta_security: { captcha_token: undefined },
    })
  })

  it('password reset uses PKCE and the next sign-up still does not', async () => {
    const storage = memoryStorage()
    const { client, calls } = clientRecording(storage)
    await sendPasswordReset(client, 'person@example.com', redirectTo)
    const recover = calls.find((call) => call.url.includes('/recover'))
    const verifierKey = [...storage.map.keys()].find((key) => key.endsWith('-code-verifier'))
    const stored = JSON.parse(verifierKey ? storage.map.get(verifierKey) ?? 'null' : 'null') as string
    const verifier = stored.split('/')[0]
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    expect(recover?.url).toBe(`http://127.0.0.1:9/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`)
    expect(recover?.body).toMatchObject({
      email: 'person@example.com',
      code_challenge: challenge,
      code_challenge_method: 's256',
    })
    expect(stored).toBe(`${verifier}/recovery`)
    await client.auth.signUp({
      email: 'other@example.com',
      password: 'longpass',
      options: { data: { username: 'other' } },
    })
    const signup = calls.find((call) => call.url.includes('/signup'))
    expect(signup?.body?.code_challenge).toBeNull()
    expect(signup?.body?.email).toBe('other@example.com')
  })

  it('keeps a sign-up that starts during a reset off PKCE', async () => {
    const storage = memoryStorage()
    const calls: { url: string, body: Record<string, unknown> | null }[] = []
    let answerRecover: () => void = () => undefined
    const recoverHeld = new Promise<void>((resolve) => { answerRecover = resolve })
    const client = createMobileClient('http://127.0.0.1:9', 'anon-key', storage, async (input, init) => {
      const url = String(input)
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null })
      if (url.includes('/recover')) await recoverHeld
      return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const reset = sendPasswordReset(client, 'person@example.com', redirectTo)
    await client.auth.signUp({
      email: 'other@example.com',
      password: 'longpass',
      options: { data: { username: 'other' } },
    })
    answerRecover()
    await reset
    expect(calls.find((call) => call.url.includes('/recover'))?.body?.code_challenge_method).toBe('s256')
    expect(calls.find((call) => call.url.includes('/signup'))?.body?.code_challenge).toBeNull()
  })
})
