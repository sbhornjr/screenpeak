import { describe, expect, it } from 'vitest'

import { createChunkedStorage, type StringStore } from './secure-session'

function memory(): StringStore {
  const data = new Map<string, string>()
  return {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value)
    },
    removeItem: async (key) => {
      data.delete(key)
    },
  }
}

describe('createChunkedStorage', () => {
  it('round-trips a session and keeps every stored piece within the UTF-8 byte cap', async () => {
    const writes: string[] = []
    const backend = memory()
    const cap = 4
    const storage = createChunkedStorage({
      getItem: backend.getItem,
      removeItem: backend.removeItem,
      setItem: async (key, value) => {
        writes.push(value)
        await backend.setItem(key, value)
      },
    }, cap)
    const session = '😀'.repeat(3)

    await storage.setItem('session', session)

    expect(await storage.getItem('session')).toBe(session)
    expect(writes.length).toBeGreaterThan(1)
    expect(writes.every((piece) => Buffer.byteLength(piece, 'utf8') <= cap)).toBe(true)
  })

  it('forgets the previous chunks when the session is replaced or removed', async () => {
    const backend = memory()
    const storage = createChunkedStorage(backend, 4)
    await storage.setItem('session', '😀'.repeat(3))
    await storage.setItem('session', 'ok')

    expect(await storage.getItem('session')).toBe('ok')

    await storage.removeItem('session')
    expect(await storage.getItem('session')).toBeNull()
  })
})
