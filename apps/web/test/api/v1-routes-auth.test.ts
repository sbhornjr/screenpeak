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
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
// home and ratings_reviews have no caller. app-config is read before sign-in,
// including with a stale bearer, so it must not touch the session. Every other
// route must call the bearer helper so a cookie cannot stand in, and so a bad
// token fails closed.
const NO_CALLER = new Set([
    'home/route.ts',
    'user/[username]/ratings_reviews/route.ts',
    'app-config/route.ts',
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

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
    return ts.isFunctionDeclaration(node)
        || ts.isFunctionExpression(node)
        || ts.isArrowFunction(node)
        || ts.isMethodDeclaration(node)
        || ts.isConstructorDeclaration(node)
        || ts.isGetAccessorDeclaration(node)
        || ts.isSetAccessorDeclaration(node)
}

// A parameter, a `const`/`let`/`var` in this function, or a nested function
// declaration hoists over the import for the whole function. A declaration
// inside a further nested function does not.
function functionBodyShadows(fn: ts.Node, name: string): boolean {
    const parameters = isFunctionLike(fn) ? fn.parameters : []
    if (parameters.some(param => ts.isIdentifier(param.name) && param.name.text === name)) return true
    let shadowed = false
    const visit = (node: ts.Node) => {
        if (node !== fn && isFunctionLike(node)) {
            if (ts.isFunctionDeclaration(node) && node.name?.text === name) shadowed = true
            return
        }
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) shadowed = true
        ts.forEachChild(node, visit)
    }
    visit(fn)
    return shadowed
}

function callsName(fn: ts.Node, name: string): boolean {
    if (functionBodyShadows(fn, name)) return false
    let found = false
    const visit = (node: ts.Node) => {
        if (node !== fn && isFunctionLike(node)) return
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) found = true
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
        expect(files.some(file => file.endsWith('/app-config/route.ts'))).toBe(true)
        expect(files.some(file => file.endsWith('/me/steam/link-intent/route.ts'))).toBe(true)
        expect(files.some(file => file.endsWith('/me/steam/import/route.ts'))).toBe(true)
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
            const requireBearer = namedImport(source, '@/lib/auth', 'requireBearerUser')
            const writeLimit = namedImport(source, '@/lib/rate-limit', 'consumeWriteRateLimit')
            const writeLimitCounts = !!writeLimit && !locallyDeclared(source, writeLimit)
            for (const handler of handlers) {
                if (WRITE_METHODS.has(handler.method)) {
                    if (!requireBearer || locallyDeclared(source, requireBearer) || !handler.fn || !callsName(handler.fn, requireBearer)) {
                        problems.push(`${label} ${handler.method} must call requireBearerUser from @/lib/auth`)
                    }
                    if (!writeLimitCounts || !writeLimit || !handler.fn || !callsName(handler.fn, writeLimit)) {
                        problems.push(`${label} ${handler.method} must call consumeWriteRateLimit from @/lib/rate-limit`)
                    }
                } else if (handler.fn && writeLimitCounts && writeLimit && callsName(handler.fn, writeLimit)) {
                    problems.push(`${label} ${handler.method} must not spend the write budget`)
                }
            }
            if (label.endsWith('/search/route.ts') || label.endsWith('search/route.ts')) {
                const limitName = namedImport(source, '@/lib/rate-limit', 'consumeSearchRateLimit')
                const callsLimit = !!limitName && !locallyDeclared(source, limitName) && handlers.some(handler => handler.fn && callsName(handler.fn, limitName))
                if (!callsLimit) problems.push(`${label} must call consumeSearchRateLimit from @/lib/rate-limit`)
            }
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

const SEARCH_QUERY_EXPORTS = ['searchGamesByName', 'searchTaxonomyTable', 'searchLibraryTaxonomy'] as const
const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const SKIP_DIRS = new Set(['node_modules', '.next', 'test', 'coverage', 'dist'])

function appSourceFiles(dir: string): string[] {
    const found: string[] = []
    for (const entry of readdirSync(dir)) {
        if (SKIP_DIRS.has(entry)) continue
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) found.push(...appSourceFiles(path))
        else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) found.push(path)
    }
    return found
}

function searchBudgetProblems(source: ts.SourceFile, label: string): string[] {
    const searchNames = SEARCH_QUERY_EXPORTS
        .map(exported => namedImport(source, '@/lib/queries/game', exported))
        .filter((name): name is string => !!name)
    if (searchNames.length === 0) return []
    const limitName = namedImport(source, '@/lib/rate-limit', 'consumeSearchRateLimit')
    const limitCounts = !!limitName && !locallyDeclared(source, limitName)
    const problems: string[] = []
    const visit = (node: ts.Node) => {
        if (isFunctionLike(node) && searchNames.some(name => callsName(node, name))) {
            if (!limitCounts || !limitName || !callsName(node, limitName)) {
                problems.push(`${label} calls ${searchNames.join('/')} without the imported consumeSearchRateLimit`)
            }
        }
        ts.forEachChild(node, visit)
    }
    visit(source)
    return problems
}

describe('search budget', () => {
    it('requires the imported consumeSearchRateLimit beside every catalogue search call', () => {
        const problems: string[] = []
        for (const file of appSourceFiles(webRoot)) {
            const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
            problems.push(...searchBudgetProblems(source, relative(webRoot, file)))
        }
        expect(problems).toEqual([])
    })

    it('does not treat a nested consumeSearchRateLimit as the import', () => {
        const file = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/nested-search-limit.ts')
        const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
        const problems = searchBudgetProblems(source, 'fixtures/nested-search-limit.ts')
        expect(problems.length).toBeGreaterThan(0)
        expect(problems.join('\n')).toMatch(/consumeSearchRateLimit/)
    })
})
