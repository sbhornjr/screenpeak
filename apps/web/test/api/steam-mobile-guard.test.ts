import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { MOBILE_STEAM_RETURN_URL } from '@screenpeak/shared/api/steam'

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const COOKIE_AUTH = new Set(['getOptionalUser', 'requireUser'])

function source(file: string): ts.SourceFile {
    const path = join(webRoot, file)
    return ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
    return ts.isFunctionDeclaration(node)
        || ts.isFunctionExpression(node)
        || ts.isArrowFunction(node)
        || ts.isMethodDeclaration(node)
}

function functionByName(file: ts.SourceFile, name: string): ts.Node | null {
    for (const statement of file.statements) {
        if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) return statement
        if (!ts.isVariableStatement(statement)) continue
        for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name || !declaration.initializer) continue
            if (isFunctionLike(declaration.initializer)) return declaration.initializer
        }
    }
    return null
}

function handler(file: ts.SourceFile, method: string): ts.Node {
    for (const statement of file.statements) {
        if (ts.isFunctionDeclaration(statement) && statement.name?.text === method) return statement
        if (!ts.isVariableStatement(statement)) continue
        for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name) || declaration.name.text !== method || !declaration.initializer) continue
            const init = declaration.initializer
            if (!ts.isCallExpression(init)) continue
            const arg = init.arguments[0]
            if (arg && (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg))) return arg
        }
    }
    throw new Error(`missing ${method}`)
}

function statementsOf(fn: ts.Node): ts.Statement[] {
    if (isFunctionLike(fn) && fn.body && ts.isBlock(fn.body)) return [...fn.body.statements]
    throw new Error('handler has no block body')
}

function isStateNullReturn(statement: ts.Statement): statement is ts.IfStatement {
    if (!ts.isIfStatement(statement)) return false
    const condition = statement.expression
    if (!ts.isBinaryExpression(condition) || condition.operatorToken.kind !== ts.SyntaxKind.ExclamationEqualsEqualsToken) return false
    if (condition.right.kind !== ts.SyntaxKind.NullKeyword) return false
    const then = statement.thenStatement
    if (ts.isReturnStatement(then)) return true
    return ts.isBlock(then) && then.statements.some(child => ts.isReturnStatement(child))
}

function directCalls(node: ts.Node): string[] {
    const names: string[] = []
    const visit = (current: ts.Node) => {
        if (current !== node && isFunctionLike(current)) return
        if (ts.isCallExpression(current) && ts.isIdentifier(current.expression)) names.push(current.expression.text)
        ts.forEachChild(current, visit)
    }
    visit(node)
    return names
}

/** Cookie auth on the mobile path, including one same-file callee. */
function unprotectedCookieAuth(file: ts.SourceFile, fn: ts.Node): string[] {
    const statements = statementsOf(fn)
    const gate = statements.findIndex(isStateNullReturn)
    if (gate < 0) return ['missing `if (state !== null) return`']
    const problems: string[] = []
    const look = (node: ts.Node, mobile: boolean) => {
        for (const name of directCalls(node)) {
            if (mobile && COOKIE_AUTH.has(name)) problems.push(name)
            const callee = functionByName(file, name)
            if (!callee || callee === fn) continue
            const nested = directCalls(callee).filter(call => COOKIE_AUTH.has(call))
            if (mobile && nested.length) problems.push(`${name} -> ${nested.join(', ')}`)
        }
    }
    for (const statement of statements.slice(0, gate)) look(statement, true)
    const branch = statements[gate] as ts.IfStatement
    look(branch.thenStatement, true)
    if (branch.elseStatement) look(branch.elseStatement, false)
    for (const statement of statements.slice(gate + 1)) look(statement, false)
    return problems
}

describe('mobile Steam routes never read the website session', () => {
    it('matches the phone scheme and keeps the state return in front of cookie auth', () => {
        const app = JSON.parse(readFileSync(join(webRoot, '../mobile/app.json'), 'utf8')) as { expo: { scheme: string } }
        expect(MOBILE_STEAM_RETURN_URL).toBe(`${app.expo.scheme}://steamlink`)

        const forbidden = ['getOptionalUser', 'requireUser', 'cookies', 'createClient', 'upsertSteamAccount', 'searchParams']
        for (const file of ['app/api/steam/link/route.ts', 'app/api/steam/callback/route.ts']) {
            const parsed = source(file)
            const text = readFileSync(join(webRoot, file), 'utf8')
            expect(text).not.toMatch(/from 'next\/headers'|from '@\/lib\/supabase-server'/)
            expect(unprotectedCookieAuth(parsed, handler(parsed, 'GET'))).toEqual([])
            for (const name of ['mobileSteamLink', 'mobileSteamCallback']) {
                const fn = functionByName(parsed, name)
                if (!fn) continue
                expect(directCalls(fn).filter(call => forbidden.includes(call))).toEqual([])
            }
        }
    })
})
