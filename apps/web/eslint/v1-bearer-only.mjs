/** `/api/v1` is bearer-only. Cookie helpers here would let a website session
 *  authorize a phone route. Wired for `app/api/v1/**` in eslint.config.mjs.
 *  Scope analysis follows aliases (`import { getOptionalUser as readSession }`,
 *  `const readSession = getOptionalUser`) and member calls (`auth.getOptionalUser()`).
 *  A namespace import or a dynamic `import()` of the cookie modules is rejected
 *  even when the file never spells the helper's name at the import site. */

const COOKIE_HELPERS = new Set(['getOptionalUser', 'requireUser'])

function literalSource(node) {
    if (!node) return null
    if (node.type === 'Literal' && typeof node.value === 'string') return node.value
    return null
}

function isAuthModule(source) {
    return source === '@/lib/auth' || source.endsWith('/lib/auth')
}

function isHeadersModule(source) {
    return source === 'next/headers'
}

function isSupabaseServer(source) {
    return source === '@/lib/supabase-server' || source.endsWith('/supabase-server')
}

function importedName(specifier) {
    if (!specifier.imported) return specifier.local?.name
    return specifier.imported.name || specifier.imported.value
}

function findVariable(scope, name) {
    let current = scope
    while (current) {
        const found = current.variables?.find((variable) => variable.name === name)
        if (found) return found
        current = current.upper
    }
    return null
}

function expressionIsCookieHelper(node, context, seen) {
    if (!node || seen.has(node)) return false
    seen.add(node)
    if (node.type === 'Identifier') {
        if (COOKIE_HELPERS.has(node.name)) return true
        let scope
        try {
            scope = context.sourceCode.getScope(node)
        } catch {
            return false
        }
        const variable = findVariable(scope, node.name)
        if (!variable) return false
        return variable.defs.some((def) => {
            if (def.type === 'ImportBinding' && def.node) {
                return COOKIE_HELPERS.has(importedName(def.node))
            }
            if (def.node?.type === 'VariableDeclarator' && def.node.init && def.node.init !== node) {
                return expressionIsCookieHelper(def.node.init, context, seen)
            }
            if (def.node?.type === 'FunctionDeclaration' && COOKIE_HELPERS.has(def.node.id?.name)) return true
            return false
        })
    }
    if (
        node.type === 'MemberExpression'
        && !node.computed
        && node.property?.type === 'Identifier'
        && COOKIE_HELPERS.has(node.property.name)
    ) {
        return true
    }
    return false
}

const rule = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Keep /api/v1 on getBearerUser / requireBearerUser. Cookie auth is for the website.',
        },
        messages: {
            cookieHelper: 'Use getBearerUser or requireBearerUser in /api/v1. {{name}} reads the website session cookie.',
            cookies: 'Do not read next/headers cookies in /api/v1. Auth is the Authorization bearer only.',
            supabaseServer: 'Do not import the cookie Supabase client (@/lib/supabase-server) from /api/v1.',
            dynamicAuth: 'Do not dynamically import @/lib/auth from /api/v1. Import getBearerUser or requireBearerUser by name.',
            namespaceAuth: 'Do not namespace-import @/lib/auth in /api/v1. Import getBearerUser or requireBearerUser by name.',
            namespaceHeaders: 'Do not namespace-import next/headers in /api/v1.',
        },
        schema: [],
    },
    create(context) {
        function reportDynamic(node, source) {
            if (!source) return
            if (isAuthModule(source)) context.report({ node, messageId: 'dynamicAuth' })
            if (isHeadersModule(source)) context.report({ node, messageId: 'cookies' })
            if (isSupabaseServer(source)) context.report({ node, messageId: 'supabaseServer' })
        }

        return {
            ImportDeclaration(node) {
                const source = node.source.value
                if (typeof source !== 'string') return
                if (isSupabaseServer(source)) context.report({ node, messageId: 'supabaseServer' })
                for (const specifier of node.specifiers) {
                    if (specifier.type === 'ImportNamespaceSpecifier') {
                        if (isAuthModule(source)) context.report({ node: specifier, messageId: 'namespaceAuth' })
                        if (isHeadersModule(source)) context.report({ node: specifier, messageId: 'namespaceHeaders' })
                        if (isSupabaseServer(source)) context.report({ node: specifier, messageId: 'supabaseServer' })
                    }
                    const name = importedName(specifier)
                    if (COOKIE_HELPERS.has(name)) {
                        context.report({ node: specifier, messageId: 'cookieHelper', data: { name } })
                    }
                    if (isHeadersModule(source) && name === 'cookies') {
                        context.report({ node: specifier, messageId: 'cookies' })
                    }
                }
            },
            ExportNamedDeclaration(node) {
                const source = node.source?.value
                if (typeof source !== 'string') return
                reportDynamic(node, source)
                for (const specifier of node.specifiers ?? []) {
                    const local = specifier.local?.name
                    const exported = specifier.exported?.name
                    if (COOKIE_HELPERS.has(local) || COOKIE_HELPERS.has(exported)) {
                        context.report({ node: specifier, messageId: 'cookieHelper', data: { name: local || exported } })
                    }
                }
            },
            ImportExpression(node) {
                reportDynamic(node, literalSource(node.source))
            },
            CallExpression(node) {
                const callee = node.callee
                if (expressionIsCookieHelper(callee, context, new Set())) {
                    const name = callee.type === 'Identifier'
                        ? callee.name
                        : callee.property?.name || 'getOptionalUser'
                    context.report({ node, messageId: 'cookieHelper', data: { name } })
                }
                if (callee.type === 'Identifier' && callee.name === 'cookies') {
                    context.report({ node, messageId: 'cookies' })
                }
                if (
                    callee.type === 'MemberExpression'
                    && !callee.computed
                    && callee.property.type === 'Identifier'
                    && callee.property.name === 'cookies'
                ) {
                    context.report({ node, messageId: 'cookies' })
                }
            },
        }
    },
}

export default rule
