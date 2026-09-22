import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '@/db/schema'
import * as relations from '@/db/relations'

const connectionString = process.env.DATABASE_POOL_URL
if (!connectionString) throw new Error('DATABASE_POOL_URL is not set')

const client = postgres(connectionString, { prepare: false })

export const db = drizzle(client, { schema: { ...schema, ...relations } })
export type DB = typeof db
