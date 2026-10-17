import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Every /api/v1 route file must wrap its handlers in withAuth and resolve the
// caller with getBearerUser (reads) or requireBearerUser (writes). This is a
// source scan: it does not boot Next or Postgres.

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '../../app/api/v1')
const HANDLER = /export const (GET|POST|PUT|PATCH|DELETE)\s*=\s*([^\n]+)/g
const BEARER_CALL = /\b(?:getBearerUser|requireBearerUser)\s*\(/
// These two responses have no caller. Their route tests lock that they do not
// read a session. Every other route must call the bearer helper so a cookie
// cannot stand in, and so a bad token fails closed.
const NO_CALLER = new Set([
    'home/route.ts',
    'user/[username]/ratings_reviews/route.ts',
])

function routeFiles(dir: string): string[] {
    const found: string[] = []
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) found.push(...routeFiles(path))
        else if (entry === 'route.ts') found.push(path)
    }
    return found
}

describe('/api/v1 route auth', () => {
    const files = routeFiles(apiRoot)

    it('finds the read routes and the write routes', () => {
        expect(files.length).toBeGreaterThanOrEqual(20)
        expect(files.some(file => file.endsWith('/me/library/[gameId]/route.ts'))).toBe(true)
        expect(files.some(file => file.endsWith('/games/[slug]/route.ts'))).toBe(true)
    })

    it('wraps every handler in withAuth and calls getBearerUser or requireBearerUser', () => {
        const problems: string[] = []
        for (const file of files) {
            const text = readFileSync(file, 'utf8')
            const label = relative(apiRoot, file)
            const handlers = [...text.matchAll(HANDLER)]
            if (handlers.length === 0) problems.push(`${label} exports no HTTP handler`)
            for (const handler of handlers) {
                const rhs = handler[2].trim()
                if (!rhs.startsWith('withAuth(')) problems.push(`${label} ${handler[1]} is not withAuth`)
            }
            if (NO_CALLER.has(label)) {
                if (BEARER_CALL.test(text)) problems.push(`${label} reads a session, but this response has no caller`)
                if (/getOptionalUser|requireUser|supabase-server|next\/headers/.test(text)) {
                    problems.push(`${label} imports cookie auth`)
                }
            } else if (!BEARER_CALL.test(text)) {
                problems.push(`${label} does not call getBearerUser or requireBearerUser`)
            }
        }
        expect(problems).toEqual([])
    })
})
