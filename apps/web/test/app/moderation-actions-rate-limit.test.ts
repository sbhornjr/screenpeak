import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// Server Actions in app/*.ts have no `/api/v1` route wrapper and no shared
// `withAuth` to enforce a rate limit for them — test/api/v1-routes-auth.test.ts
// only scans app/api/v1/**/route.ts, so it can't see these. toggleBlock
// (app/user-actions.ts) and submitReport (app/report-actions.ts) are each
// responsible for calling their own rate limiter, and nothing else in the
// codebase would catch a regression where that call is removed. This is a
// static AST check for exactly that, mirroring the namedImport/callsName/
// locallyDeclared technique in test/api/v1-routes-auth.test.ts (those helpers
// are not exported from that file, so they're reimplemented here rather than
// imported).

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '../../app')

function parse(file: string): ts.SourceFile {
    return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
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

function isExported(node: ts.Node): boolean {
    return (ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false
}

/** Finds an exported top-level function (declaration, or `export const name = (...) => {}`) by name. */
function exportedFunction(source: ts.SourceFile, name: string): ts.FunctionLikeDeclaration | null {
    for (const statement of source.statements) {
        if (ts.isFunctionDeclaration(statement) && isExported(statement) && statement.name?.text === name) {
            return statement
        }
        if (ts.isVariableStatement(statement) && isExported(statement)) {
            for (const declaration of statement.declarationList.declarations) {
                if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name) continue
                const init = declaration.initializer
                if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) return init
            }
        }
    }
    return null
}

describe('web Server Action rate limits', () => {
    it('toggleBlock calls the imported consumeWriteRateLimit', () => {
        const file = join(appRoot, 'user-actions.ts')
        const source = parse(file)

        const limitName = namedImport(source, '@/lib/rate-limit', 'consumeWriteRateLimit')
        expect(limitName, 'user-actions.ts must import consumeWriteRateLimit from @/lib/rate-limit').toBeTruthy()
        expect(locallyDeclared(source, limitName!), `${limitName} must not be redeclared locally`).toBe(false)

        const fn = exportedFunction(source, 'toggleBlock')
        expect(fn, 'user-actions.ts must export a toggleBlock function').toBeTruthy()

        expect(callsName(fn!, limitName!)).toBe(true)
    })

    it('submitReport calls the imported consumeReportRateLimit', () => {
        const file = join(appRoot, 'report-actions.ts')
        const source = parse(file)

        const limitName = namedImport(source, '@/lib/rate-limit', 'consumeReportRateLimit')
        expect(limitName, 'report-actions.ts must import consumeReportRateLimit from @/lib/rate-limit').toBeTruthy()
        expect(locallyDeclared(source, limitName!), `${limitName} must not be redeclared locally`).toBe(false)

        const fn = exportedFunction(source, 'submitReport')
        expect(fn, 'report-actions.ts must export a submitReport function').toBeTruthy()

        expect(callsName(fn!, limitName!)).toBe(true)
    })
})
