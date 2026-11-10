let recovery = false
const listeners = new Set<() => void>()

export function readRecovery(): boolean {
  return recovery
}

export function writeRecovery(next: boolean) {
  if (recovery === next) return
  recovery = next
  for (const listener of listeners) listener()
}

export function subscribeRecovery(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
