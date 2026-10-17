import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// Every /api/v1 route file must wrap its handlers in withAuth imported from
// @/lib/api, and the handler must call getBearerUser or requireBearerUser
// imported from @/lib/auth. The TypeScript AST ignores comments, so a line
// like `// requireBearerUser()` does not count, and a local function named
// withAuth does not count.

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '../../app/api/v1')
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
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

function parse(file: string): ts.SourceFile {
    return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

function isExported(node: ts.Node): boolean {
    return (ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false
}

function moduleSpecifier(node: ts.ImportDeclaration): string | null {
    return ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : null
}

function namedImport(source: ts.SourceFile, from: string, exported: string): string | null {
    for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) continue
        if (moduleSpecifier(statement) !== from) continue
        const bindings = statement.importClause?.namedBindings
        if (!bindings || !ts.isNamedImports(bindings)) continue
        for (const element of bindings.elements) {
            if (element.isTypeOnly) continue
            if ((element.propertyName ?? element.name).text === exported) return element.name.text
        }
    }
    return null
}

function locallyDeclared(source: ts.SourceFile, name: string): boolean {
    for (const statement of source.statements) {
        if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) return true
        if (ts.isClassDeclaration(statement) && statement.name?.text === name) return true
        if (ts.isVariableStatement(statement)) {
            for (const declaration of statement.declarationList.declarations) {
                if (ts.isIdentifier(declaration.name) && declaration.name.text === name) return true
            }
        }
    }
    return false
}

function callsName(fn: ts.Node, name: string): boolean {
    let found = false
    const visit = (node: ts.Node) => {
        if (
            ts.isCallExpression(node)
            && ts.isIdentifier(node.expression)
            && node.expression.text === name
        ) {
            // A function declared inside the handler that reuses the name is not the import.
            found = true
        }
        ts.forEachChild(node, visit)
    }
    visit(fn)
    return found
}

function handlerFunctions(source: ts.SourceFile, withAuthName: string | null): { method: string, fn: ts.Node | null, callee: string | null }[] {
    const handlers: { method: string, fn: ts.Node | null, callee: string | null }[] = []
    for (const statement of source.statements) {
        if (!ts.isVariableStatement(statement) || !isExported(statement)) continue
        for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name) || !METHODS.has(declaration.name.text) || !declaration.initializer) continue
            const init = declaration.initializer
            if (!ts.isCallExpression(init)) {
                handlers.push({ method: declaration.name.text, fn: null, callee: null })
                continue
            }
            const callee = ts.isIdentifier(init.expression) ? init.expression.text : null
            const arg = init.arguments[0]
            const fn = arg && (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) ? arg : null
            handlers.push({
                method: declaration.name.text,
                fn: callee === withAuthName ? fn : null,
                callee,
            })
        }
    }
    return handlers
}

function importsCookieAuth(source: ts.SourceFile): boolean {
    for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement)) continue
        const spec = moduleSpecifier(statement)
        if (spec === '@/lib/supabase-server' || spec === 'next/headers') return true
        const bindings = statement.importClause?.namedBindings
        if (!bindings || !ts.isNamedImports(bindings)) continue
        for (const element of bindings.elements) {
            const exported = (element.propertyName ?? element.name).text
            if (exported === 'getOptionalUser' || exported === 'requireUser') return true
        }
    }
    return false
}

describe('/api/v1 route auth', () => {
    const files = routeFiles(apiRoot)

    it('finds the read routes and the write routes', () => {
        expect(files.length).toBeGreaterThanOrEqual(20)
        expect(files.some(file => file.endsWith('/me/library/[gameId]/route.ts'))).toBe(true)
        expect(files.some(file => file.endsWith('/games/[slug]/route.ts'))).toBe(true)
        expect(files.some(file => file.endsWith('/lists/[listId]/route.ts'))).toBe(true)
    })

    it('wraps every handler in withAuth from @/lib/api and calls the bearer helper', () => {
        const problems: string[] = []
        for (const file of files) {
            const source = parse(file)
            const label = relative(apiRoot, file)
            const withAuthName = namedImport(source, '@/lib/api', 'withAuth')
            if (!withAuthName) problems.push(`${label} does not import withAuth from @/lib/api`)
            else if (locallyDeclared(source, withAuthName)) problems.push(`${label} declares a local ${withAuthName}; that is not withAuth from @/lib/api`)

            const handlers = handlerFunctions(source, withAuthName)
            if (handlers.length === 0) problems.push(`${label} exports no HTTP handler`)
            for (const handler of handlers) {
                if (handler.callee !== withAuthName) problems.push(`${label} ${handler.method} is not withAuth from @/lib/api`)
            }

            const bearerNames = [
                namedImport(source, '@/lib/auth', 'getBearerUser'),
                namedImport(source, '@/lib/auth', 'requireBearerUser'),
            ].filter((name): name is string => !!name)
            for (const name of bearerNames) {
                if (locallyDeclared(source, name)) problems.push(`${label} declares a local ${name}; that is not the bearer helper`)
            }

            const callsBearer = handlers.some(handler => handler.fn && bearerNames.some(name => callsName(handler.fn!, name)))
            if (NO_CALLER.has(label)) {
                if (callsBearer || bearerNames.length > 0) problems.push(`${label} reads a session, but this response has no caller`)
                if (importsCookieAuth(source)) problems.push(`${label} imports cookie auth`)
            } else if (!callsBearer) {
                problems.push(`${label} does not call getBearerUser or requireBearerUser`)
            }
        }
        expect(problems).toEqual([])
    })
})
