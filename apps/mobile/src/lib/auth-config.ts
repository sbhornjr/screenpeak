const FIELDS = [
  ['EXPO_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'],
  ['EXPO_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
] as const

function devRuntime(): boolean {
  if (typeof __DEV__ === 'boolean') return __DEV__
  return process.env.NODE_ENV !== 'production'
}

/** Names the missing public Supabase variables in dev. A release build stays short. */
export function authConfigError(kind: 'Sign-in' | 'Sign-up' = 'Sign-in'): string {
  const short = `${kind} is not configured.`
  if (!devRuntime()) return short
  const missing = FIELDS.filter(([name]) => !process.env[name]?.trim())
  if (missing.length === 0) return short
  const names = missing.map(([name]) => name).join(' and ')
  const web = missing.map(([, next]) => next).join(' and ')
  const matches = missing.length === 1 ? 'It matches' : 'They match'
  return `${short} Set ${names} in apps/mobile/.env. ${matches} ${web} in apps/web/.env.local.`
}
