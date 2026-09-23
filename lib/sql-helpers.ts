import { sql } from 'drizzle-orm'

// Interpolating a plain JS array into drizzle-orm's `sql` tag expands it into
// an IN-list, e.g. `($1, $2)` — that breaks a Postgres function parameter
// typed as `uuid[]`, which expects a single array value. This builds a real
// `ARRAY[...]::uuid[]` literal instead, or `NULL` to match a `DEFAULT NULL`
// array parameter.
export function uuidArrayParam(ids: (string | number)[] | null | undefined) {
    if (!ids || ids.length === 0) return sql`NULL`
    return sql`ARRAY[${sql.join(ids.map(id => sql`${String(id)}`), sql`, `)}]::uuid[]`
}
