import "server-only"

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '@/db/schema'
import * as relations from '@/db/relations'

const connectionString = process.env.DATABASE_POOL_URL
if (!connectionString) throw new Error('DATABASE_POOL_URL is not set')

// postgres-js returns bigint (OID 20) and numeric (OID 1700) as strings by
// default. Every RPC function we call via `db.execute` returns COUNT(*) as
// bigint and averages as numeric, and their TS types (and supabase-js, which
// they were written against) expect numbers — so a string "9.67" slips past
// `as unknown as T` and fails `typeof x === "number"` / `x === 1` checks.
// Parse both as JS numbers: counts and 2dp ratings are well within float
// precision. Drizzle's typed `numeric()` columns (hours_played) are unaffected —
// their default mode maps the driver value back to a string.
const toNumber = (x: string) => Number(x)
const client = postgres(connectionString, {
    prepare: false,
    types: {
        bigint: { to: 20, from: [20], parse: toNumber, serialize: String },
        numeric: { to: 1700, from: [1700], parse: toNumber, serialize: String },
    },
})

export const db = drizzle(client, { schema: { ...schema, ...relations } })
export type DB = typeof db
