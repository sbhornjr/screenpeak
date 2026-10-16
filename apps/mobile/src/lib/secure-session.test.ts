import { describe, expect, it } from 'vitest'

import { createChunkedStorage, type StringStore } from './secure-session'

function memory(): StringStore & { keys: () => string[] } {
  const data = new Map<string, string>()
  return {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value)
    },
    removeItem: async (key) => {
      data.delete(key)
    },
    keys: () => [...data.keys()],
  }
}

describe('createChunkedStorage', () => {
  it('reads back a session larger than one secure-store value', async () => {
    const backend = memory()
    const storage = createChunkedStorage(backend, 1800)
    const session = `header.${'a'.repeat(4000)}.signature`

    await storage.setItem('sb-auth', session)

    expect(await storage.getItem('sb-auth')).toBe(session)
    expect(backend.keys().sort()).toEqual(['sb-auth.0', 'sb-auth.1', 'sb-auth.2', 'sb-auth.n'])
    expect(await backend.getItem('sb-auth.n')).toBe('3')
  })

  it('forgets the previous chunks when the session is replaced or removed', async () => {
    const backend = memory()
    const storage = createChunkedStorage(backend, 10)
    await storage.setItem('sb-auth', '0123456789abcdefghij')
    await storage.setItem('sb-auth', 'short')

    expect(await storage.getItem('sb-auth')).toBe('short')
    expect(backend.keys().sort()).toEqual(['sb-auth.0', 'sb-auth.n'])

    await storage.removeItem('sb-auth')
    expect(await storage.getItem('sb-auth')).toBeNull()
    expect(backend.keys()).toEqual([])
  })
})
