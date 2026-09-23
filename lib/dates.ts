// Drizzle/postgres-js returns timestamptz columns as "YYYY-MM-DD HH:MM:SS.sss+00"
// (space separator, 2-digit offset) instead of supabase-js/PostgREST's ISO-8601
// "YYYY-MM-DDTHH:MM:SS.sssZ" — some engines' Date parsers (notably Safari) reject
// the former. Normalizes before parsing.
export function parseDbTimestamp(value: string): Date {
    const isoLike = value.includes('T') ? value : value.replace(' ', 'T')
    const withColonOffset = /[+-]\d{2}$/.test(isoLike) ? isoLike + ':00' : isoLike
    return new Date(withColonOffset)
}
