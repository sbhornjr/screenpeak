import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// A route's `@/lib` import, and one level of functions that import calls,
// must not turn a database error into an empty stand-in. The walk includes
// same-module helpers. It also catches `catch { return fallback() }`,
// `const empty = []; return empty`, and `.catch(() => ({ ...[] }))`.
//
// `getDeveloperNameMap` and `getHeroGame` stay on the website's empty
// fallback. queries.game.test.ts and hero-game.integration.ts lock that,
// so this scan does not treat those two functions as route reads.

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const apiRoot = join(webRoot, 'app/api/v1')
const LOCKED_FALLBACK = new Set(['getDeveloperNameMap', 'getHeroGame'])

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

function resolveModule(spec: string): string | null {
    if (!spec.startsWith('@/')) return null
    const rel = spec.slice(2)
    for (const suffix of ['.ts', '.tsx', '.mts', '/index.ts']) {
        const candidate = join(webRoot, rel + suffix)
        if (existsSync(candidate)) return candidate
    }
    return null
}

function isExported(node: ts.Node): boolean {
    return (ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false
}

function findFunction(source: ts.SourceFile, name: string, exportedOnly: boolean): ts.Node | 'class' | null {
    for (const statement of source.statements) {
        if (ts.isClassDeclaration(statement) && statement.name?.text === name && (!exportedOnly || isExported(statement))) return 'class'
        if (ts.isFunctionDeclaration(statement) && statement.name?.text === name && (!exportedOnly || isExported(statement))) return statement
        if (ts.isVariableStatement(statement) && (!exportedOnly || isExported(statement))) {
            for (const declaration of statement.declarationList.declarations) {
                if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name || !declaration.initializer) continue
                if (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)) return declaration.initializer
                if (ts.isClassExpression(declaration.initializer)) return 'class'
            }
        }
    }
    return null
}

function unwrap(expression: ts.Expression): ts.Expression {
    let current = expression
    while (
        ts.isAsExpression(current)
        || ts.isParenthesizedExpression(current)
        || ts.isSatisfiesExpression(current)
        || ts.isTypeAssertionExpression(current)
        || ts.isNonNullExpression(current)
    ) {
        current = current.expression
    }
    return current
}

function isEmptyStandIn(expression: ts.Expression | undefined): boolean {
    if (!expression) return false
    const value = unwrap(expression)
    if (value.kind === ts.SyntaxKind.NullKeyword) return true
    if (ts.isArrayLiteralExpression(value) && value.elements.length === 0) return true
    if (
        ts.isNewExpression(value)
        && ts.isIdentifier(value.expression)
        && (value.expression.text === 'Set' || value.expression.text === 'Map')
        && (value.arguments?.length ?? 0) === 0
    ) return true
    return false
}

function hasErrorProperty(value: ts.ObjectLiteralExpression): boolean {
    return value.properties.some(property => {
        if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) return false
        const name = property.name
        return !!name && ts.isIdentifier(name) && name.text === 'error'
    })
}

function containsEmptyArray(expression: ts.Expression): boolean {
    const value = unwrap(expression)
    if (ts.isArrayLiteralExpression(value) && value.elements.length === 0) return true
    if (!ts.isObjectLiteralExpression(value) || hasErrorProperty(value)) return false
    return value.properties.some(property => {
        if (ts.isSpreadAssignment(property)) return isEmptyStandIn(property.expression) || containsEmptyArray(property.expression)
        if (ts.isPropertyAssignment(property)) return containsEmptyArray(property.initializer)
        return false
    })
}

function emptyBindings(fn: ts.Node): Set<string> {
    const names = new Set<string>()
    const visit = (node: ts.Node) => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && isEmptyStandIn(node.initializer)) {
            names.add(node.name.text)
        }
        ts.forEachChild(node, visit)
    }
    visit(fn)
    return names
}

function isSwallowExpression(expression: ts.Expression | undefined, bindings: Set<string>): boolean {
    if (!expression) return false
    const value = unwrap(expression)
    if (isEmptyStandIn(value)) return true
    if (ts.isIdentifier(value) && bindings.has(value.text)) return true
    // `catch { return fallback() }` — a zero-arg call used as the recovery value.
    // `return finish(req, apiError(...))` in withAuth is the error response, not a stand-in.
    if (ts.isCallExpression(value) && ts.isIdentifier(value.expression) && value.arguments.length === 0) return true
    if (containsEmptyArray(value)) return true
    if (ts.isConditionalExpression(value)) return isSwallowExpression(value.whenTrue, bindings) || isSwallowExpression(value.whenFalse, bindings)
    return false
}

function functionSwallows(fn: ts.ArrowFunction | ts.FunctionExpression, bindings: Set<string>): boolean {
    if (ts.isBlock(fn.body)) {
        let empty = false
        const visit = (node: ts.Node) => {
            if (ts.isReturnStatement(node) && isSwallowExpression(node.expression, bindings)) empty = true
            ts.forEachChild(node, visit)
        }
        visit(fn.body)
        return empty
    }
    return isSwallowExpression(fn.body, bindings)
}

function swallows(fn: ts.Node, file: string): string[] {
    const problems: string[] = []
    const bindings = emptyBindings(fn)
    const visit = (node: ts.Node) => {
        if (ts.isCatchClause(node)) {
            const look = (child: ts.Node) => {
                if (ts.isReturnStatement(child) && isSwallowExpression(child.expression, bindings)) {
                    const line = child.getSourceFile().getLineAndCharacterOfPosition(child.getStart()).line + 1
                    problems.push(`${relative(webRoot, file)}:${line} catch returns an empty stand-in`)
                }
                ts.forEachChild(child, look)
            }
            look(node.block)
        }
        if (
            ts.isCallExpression(node)
            && ts.isPropertyAccessExpression(node.expression)
            && node.expression.name.text === 'catch'
        ) {
            const callback = node.arguments[0]
            if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) && functionSwallows(callback, bindings)) {
                const line = node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1
                problems.push(`${relative(webRoot, file)}:${line} .catch returns an empty stand-in`)
            }
        }
        ts.forEachChild(node, visit)
    }
    visit(fn)
    return problems
}

function importedNames(source: ts.SourceFile): { spec: string, name: string }[] {
    const names: { spec: string, name: string }[] = []
    for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
        if (statement.importClause?.isTypeOnly) continue
        const spec = statement.moduleSpecifier.text
        if (!spec.startsWith('@/lib/')) continue
        const bindings = statement.importClause?.namedBindings
        if (!bindings || !ts.isNamedImports(bindings)) continue
        for (const element of bindings.elements) {
            if (element.isTypeOnly) continue
            names.push({ spec, name: (element.propertyName ?? element.name).text })
        }
    }
    return names
}

function calleeNames(fn: ts.Node): string[] {
    const names = new Set<string>()
    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) names.add(node.expression.text)
        ts.forEachChild(node, visit)
    }
    visit(fn)
    return [...names]
}

function resolveCallee(
    name: string,
    source: ts.SourceFile,
    sourceOf: (file: string) => ts.SourceFile,
): { file: string, fn: ts.Node } | null {
    const local = findFunction(source, name, false)
    if (local === 'class') return null
    if (local) return { file: source.fileName, fn: local }
    for (const imported of importedNames(source)) {
        if (imported.name !== name) continue
        const file = resolveModule(imported.spec)
        if (!file) return null
        const fn = findFunction(sourceOf(file), name, true)
        if (!fn || fn === 'class') return null
        return { file, fn }
    }
    // The import may alias the export. Match the local binding name.
    for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
        const bindings = statement.importClause?.namedBindings
        if (!bindings || !ts.isNamedImports(bindings)) continue
        for (const element of bindings.elements) {
            if (element.name.text !== name) continue
            const exported = (element.propertyName ?? element.name).text
            const file = resolveModule(statement.moduleSpecifier.text)
            if (!file) return null
            const fn = findFunction(sourceOf(file), exported, true)
            if (!fn || fn === 'class') return null
            return { file, fn }
        }
    }
    return null
}

describe('/api/v1 direct imports throw on a read failure', () => {
    it('does not swallow a database error as an empty stand-in, one callee deep', () => {
        const problems: string[] = []
        const parsed = new Map<string, ts.SourceFile>()
        const sourceOf = (file: string) => {
            const cached = parsed.get(file)
            if (cached) return cached
            const next = parse(file)
            parsed.set(file, next)
            return next
        }
        const seen = new Set<string>()

        const check = (file: string, name: string, fn: ts.Node) => {
            const key = `${file}#${name}`
            if (seen.has(key) || LOCKED_FALLBACK.has(name)) return
            seen.add(key)
            problems.push(...swallows(fn, file))
        }

        for (const route of routeFiles(apiRoot)) {
            const routeSource = sourceOf(route)
            for (const imported of importedNames(routeSource)) {
                const file = resolveModule(imported.spec)
                if (!file) {
                    problems.push(`${relative(webRoot, route)} imports ${imported.name} from ${imported.spec}, which did not resolve`)
                    continue
                }
                const fn = findFunction(sourceOf(file), imported.name, true)
                if (fn === 'class') continue
                if (!fn) {
                    problems.push(`${relative(webRoot, file)} does not export function ${imported.name}`)
                    continue
                }
                check(file, imported.name, fn)
                for (const callee of calleeNames(fn)) {
                    if (LOCKED_FALLBACK.has(callee)) continue
                    const resolved = resolveCallee(callee, sourceOf(file), sourceOf)
                    if (!resolved) continue
                    check(resolved.file, callee, resolved.fn)
                }
            }
        }
        expect(problems).toEqual([])
    })
})
