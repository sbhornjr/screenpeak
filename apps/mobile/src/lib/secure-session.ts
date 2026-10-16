// expo-secure-store rejects values over 2048 bytes. A Supabase session is
// larger than that, so the native adapter splits the JSON and joins it back.

export const SECURE_CHUNK = 1800

export type StringStore = {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
}

export function createChunkedStorage(store: StringStore, size = SECURE_CHUNK): StringStore {
  return {
    async getItem(key) {
      const count = await store.getItem(`${key}.n`)
      if (count == null) return store.getItem(key)
      const n = Number(count)
      if (!Number.isInteger(n) || n < 1) return null
      const parts: string[] = []
      for (let i = 0; i < n; i += 1) {
        const part = await store.getItem(`${key}.${i}`)
        if (part == null) return null
        parts.push(part)
      }
      return parts.join('')
    },
    async setItem(key, value) {
      await clearChunks(store, key)
      const chunks: string[] = []
      for (let i = 0; i < value.length; i += size) chunks.push(value.slice(i, i + size))
      if (chunks.length === 0) chunks.push('')
      for (let i = 0; i < chunks.length; i += 1) await store.setItem(`${key}.${i}`, chunks[i])
      await store.setItem(`${key}.n`, String(chunks.length))
    },
    async removeItem(key) {
      await clearChunks(store, key)
    },
  }
}

async function clearChunks(store: StringStore, key: string) {
  const prev = await store.getItem(`${key}.n`)
  const prevN = prev != null && Number.isInteger(Number(prev)) ? Number(prev) : 0
  for (let i = 0; i < prevN; i += 1) await store.removeItem(`${key}.${i}`)
  await store.removeItem(`${key}.n`)
  await store.removeItem(key)
}
