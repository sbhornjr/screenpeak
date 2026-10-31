// Drizzle/postgres-js returns timestamptz columns as "YYYY-MM-DD HH:MM:SS.sss+00"
// (space separator, 2-digit offset) instead of supabase-js/PostgREST's ISO-8601
// "YYYY-MM-DDTHH:MM:SS.sssZ" — some engines' Date parsers (notably Safari) reject
// the former. Normalizes before parsing. Both apps use it: the API passes
// those strings through to the phone.
export function parseDbTimestamp(value: string): Date {
    const isoLike = value.includes('T') ? value : value.replace(' ', 'T')
    const withColonOffset = /[+-]\d{2}$/.test(isoLike) ? isoLike + ':00' : isoLike
    return new Date(withColonOffset)
}

// A release date is a Postgres `date`, sent as "YYYY-MM-DD". new Date() reads
// that as UTC midnight, so getFullYear() west of UTC turns January 1 into the
// previous year. Read the year from the text instead.
export function releaseYear(released: string | null | undefined): number | null {
    const year = released?.match(/^(\d{4})/)?.[1]
    return year ? Number(year) : null
}
