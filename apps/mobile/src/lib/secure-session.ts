// expo-secure-store rejects values over 2048 bytes. A Supabase session is
// larger than that, so the native adapter splits the JSON on UTF-8 byte
// length and joins it back. Slicing by JS character length would put a
// multibyte character over the cap.

export const SECURE_CHUNK = 2048

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
      const chunks = chunkByUtf8Bytes(value, size)
      for (let i = 0; i < chunks.length; i += 1) await store.setItem(`${key}.${i}`, chunks[i])
      await store.setItem(`${key}.n`, String(chunks.length))
    },
    async removeItem(key) {
      await clearChunks(store, key)
    },
  }
}

function utf8Bytes(codePoint: number): number {
  if (codePoint <= 0x7f) return 1
  if (codePoint <= 0x7ff) return 2
  if (codePoint <= 0xffff) return 3
  return 4
}

export function chunkByUtf8Bytes(value: string, maxBytes: number): string[] {
  if (maxBytes < 1) throw new Error('chunk size must be at least 1 byte')
  const chunks: string[] = []
  let start = 0
  while (start < value.length) {
    let end = start
    let bytes = 0
    while (end < value.length) {
      const code = value.codePointAt(end) ?? 0
      const size = utf8Bytes(code)
      if (bytes + size > maxBytes) break
      bytes += size
      end += code > 0xffff ? 2 : 1
    }
    if (end === start) throw new Error(`A character needs more than ${maxBytes} UTF-8 bytes`)
    chunks.push(value.slice(start, end))
    start = end
  }
  if (chunks.length === 0) chunks.push('')
  return chunks
}

async function clearChunks(store: StringStore, key: string) {
  const prev = await store.getItem(`${key}.n`)
  const prevN = prev != null && Number.isInteger(Number(prev)) ? Number(prev) : 0
  for (let i = 0; i < prevN; i += 1) await store.removeItem(`${key}.${i}`)
  await store.removeItem(`${key}.n`)
  await store.removeItem(key)
}
