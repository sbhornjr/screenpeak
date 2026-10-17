import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// A 'use client' file that imports lib/queries/game.ts also imports lib/db.ts,
// and the browser bundle then fails looking for Node's fs. Search used to
// live in game-search.ts for that reason. It now goes through
// app/search-actions.ts ('use server'). lib/auth.ts pulls in the rate limiter,
// which also imports lib/db.ts, so a client file must not import that either.

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const SKIP = new Set(['node_modules', '.next', 'test', 'coverage', 'dist'])
const SEARCH_COMPONENTS = [
    'app/components/util/SearchableDropdown.tsx',
    'app/components/game/FavoriteGamePicker.tsx',
    'app/components/lists/AddToListFromListButton.tsx',
]

function sourceFiles(dir: string): string[] {
    const found: string[] = []
    for (const entry of readdirSync(dir)) {
        if (SKIP.has(entry)) continue
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) found.push(...sourceFiles(path))
        else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) found.push(path)
    }
    return found
}

function parse(file: string): ts.SourceFile {
    return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}

function isUseClient(source: ts.SourceFile): boolean {
    const first = source.statements[0]
    return !!first
        && ts.isExpressionStatement(first)
        && ts.isStringLiteral(first.expression)
        && first.expression.text === 'use client'
}

function isDbGraph(spec: string): boolean {
    const normalized = spec.replace(/\\/g, '/').replace(/\.tsx?$/, '')
    return /(?:^|\/)lib\/(?:db|auth|rate-limit|queries\/game-search|queries\/game)$/.test(normalized)
}

function valueSpecifiers(source: ts.SourceFile): string[] {
    const specs: string[] = []
    for (const statement of source.statements) {
        if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
            if (statement.importClause?.isTypeOnly) continue
            const bindings = statement.importClause?.namedBindings
            if (bindings && ts.isNamedImports(bindings) && bindings.elements.every(element => element.isTypeOnly)) continue
            specs.push(statement.moduleSpecifier.text)
        }
        if (
            ts.isExportDeclaration(statement)
            && statement.moduleSpecifier
            && ts.isStringLiteral(statement.moduleSpecifier)
            && !statement.isTypeOnly
        ) {
            specs.push(statement.moduleSpecifier.text)
        }
    }
    const visit = (node: ts.Node) => {
        if (
            ts.isCallExpression(node)
            && node.expression.kind === ts.SyntaxKind.ImportKeyword
            && node.arguments[0]
            && ts.isStringLiteral(node.arguments[0])
        ) {
            specs.push(node.arguments[0].text)
        }
        ts.forEachChild(node, visit)
    }
    visit(source)
    return specs
}

describe('client bundle boundary', () => {
    it('keeps use client files off the database graph', () => {
        const problems: string[] = []
        for (const file of sourceFiles(webRoot)) {
            const source = parse(file)
            if (!isUseClient(source)) continue
            const label = relative(webRoot, file)
            for (const spec of valueSpecifiers(source)) {
                if (isDbGraph(spec)) problems.push(`${label} imports ${spec}`)
            }
        }
        expect(problems).toEqual([])
    })

    it('sends the search boxes through the server actions', () => {
        const problems: string[] = []
        for (const label of SEARCH_COMPONENTS) {
            const source = parse(join(webRoot, label))
            const specs = valueSpecifiers(source)
            if (!specs.includes('@/app/search-actions')) problems.push(`${label} does not import @/app/search-actions`)
            for (const spec of specs) {
                if (isDbGraph(spec)) problems.push(`${label} imports ${spec}`)
            }
        }
        const actions = parse(join(webRoot, 'app/search-actions.ts'))
        const first = actions.statements[0]
        const server = !!first
            && ts.isExpressionStatement(first)
            && ts.isStringLiteral(first.expression)
            && first.expression.text === 'use server'
        if (!server) problems.push('app/search-actions.ts is not a server action module')
        expect(problems).toEqual([])
    })
})
