import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { MOBILE_STEAM_RETURN_URL } from '@screenpeak/shared/api/steam'

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

function source(file: string): ts.SourceFile {
    const path = join(webRoot, file)
    return ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

function exportedFunction(file: ts.SourceFile, name: string): ts.Node {
    for (const statement of file.statements) {
        if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) return statement
    }
    throw new Error(`missing ${name}`)
}

function calls(fn: ts.Node): string[] {
    const names: string[] = []
    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) names.push(node.expression.text)
        if (ts.isPropertyAccessExpression(node) && node.name.text === 'searchParams') names.push('searchParams')
        ts.forEachChild(node, visit)
    }
    visit(fn)
    return names
}

describe('mobile Steam routes never read the website session', () => {
    it('matches the phone scheme and keeps cookies out of the state handlers', () => {
        const app = JSON.parse(readFileSync(join(webRoot, '../mobile/app.json'), 'utf8')) as { expo: { scheme: string } }
        expect(MOBILE_STEAM_RETURN_URL).toBe(`${app.expo.scheme}://steamlink`)

        const forbidden = ['getOptionalUser', 'requireUser', 'cookies', 'createClient', 'upsertSteamAccount', 'searchParams']
        for (const [file, name] of [
            ['app/api/steam/link/route.ts', 'mobileSteamLink'],
            ['app/api/steam/callback/route.ts', 'mobileSteamCallback'],
        ] as const) {
            const parsed = source(file)
            const text = readFileSync(join(webRoot, file), 'utf8')
            expect(text).not.toMatch(/from 'next\/headers'|from '@\/lib\/supabase-server'/)
            expect(calls(exportedFunction(parsed, name)).filter(call => forbidden.includes(call))).toEqual([])
        }
    })
})
