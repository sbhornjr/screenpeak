import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// Direct imports only. A route file's own `@/lib` functions must not turn a
// database error into an empty stand-in (`[]`, `null`, `new Set()`, `new Map()`)
// or `.catch(() => [])`. Walking callees would fail this suite on purpose:
// loaders still call catalogue helpers that swallow for the website, and
// `queries.game.test.ts` locks `getDeveloperNameMap` returning an empty map.
// Those helpers are not what the route file imports.

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const apiRoot = join(webRoot, 'app/api/v1')

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

function findFunction(source: ts.SourceFile, name: string): ts.Node | 'class' | null {
    for (const statement of source.statements) {
        if (ts.isClassDeclaration(statement) && statement.name?.text === name && isExported(statement)) return 'class'
        if (ts.isFunctionDeclaration(statement) && statement.name?.text === name && isExported(statement)) return statement
        if (ts.isVariableStatement(statement) && isExported(statement)) {
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

function functionReturnsEmpty(fn: ts.ArrowFunction | ts.FunctionExpression): boolean {
    if (ts.isBlock(fn.body)) {
        let empty = false
        const visit = (node: ts.Node) => {
            if (ts.isReturnStatement(node) && isEmptyStandIn(node.expression)) empty = true
            ts.forEachChild(node, visit)
        }
        visit(fn.body)
        return empty
    }
    return isEmptyStandIn(fn.body)
}

function swallows(fn: ts.Node, file: string): string[] {
    const problems: string[] = []
    const visit = (node: ts.Node) => {
        if (ts.isCatchClause(node)) {
            const look = (child: ts.Node) => {
                if (ts.isReturnStatement(child) && isEmptyStandIn(child.expression)) {
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
            if ((callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) && functionReturnsEmpty(callback))) {
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

describe('/api/v1 direct imports throw on a read failure', () => {
    it('does not swallow a database error as [], null, an empty Set, or an empty Map', () => {
        const problems: string[] = []
        const parsed = new Map<string, ts.SourceFile>()
        const sourceOf = (file: string) => {
            const cached = parsed.get(file)
            if (cached) return cached
            const next = parse(file)
            parsed.set(file, next)
            return next
        }

        for (const route of routeFiles(apiRoot)) {
            for (const imported of importedNames(sourceOf(route))) {
                const file = resolveModule(imported.spec)
                if (!file) {
                    problems.push(`${relative(webRoot, route)} imports ${imported.name} from ${imported.spec}, which did not resolve`)
                    continue
                }
                const fn = findFunction(sourceOf(file), imported.name)
                if (fn === 'class') continue
                if (!fn) {
                    problems.push(`${relative(webRoot, file)} does not export function ${imported.name}`)
                    continue
                }
                problems.push(...swallows(fn, file))
            }
        }
        expect(problems).toEqual([])
    })
})
