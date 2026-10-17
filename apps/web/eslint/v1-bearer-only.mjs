/** `/api/v1` is bearer-only. Cookie helpers here would let a website session
 *  authorize a phone route. Wired for `app/api/v1/**` in eslint.config.mjs. */

const COOKIE_AUTH = new Set(['getOptionalUser', 'requireUser'])

function importedName(specifier) {
    if (!specifier.imported) return specifier.local?.name
    return specifier.imported.name || specifier.imported.value
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
        },
        schema: [],
    },
    create(context) {
        return {
            ImportDeclaration(node) {
                const source = node.source.value
                if (typeof source !== 'string') return
                if (source === '@/lib/supabase-server' || source.endsWith('/supabase-server')) {
                    context.report({ node, messageId: 'supabaseServer' })
                }
                for (const specifier of node.specifiers) {
                    const name = importedName(specifier)
                    if (COOKIE_AUTH.has(name)) {
                        context.report({ node: specifier, messageId: 'cookieHelper', data: { name } })
                    }
                    if (source === 'next/headers' && name === 'cookies') {
                        context.report({ node: specifier, messageId: 'cookies' })
                    }
                }
            },
            ImportExpression(node) {
                const source = node.source && node.source.type === 'Literal' ? node.source.value : null
                if (source === 'next/headers') context.report({ node, messageId: 'cookies' })
                if (source === '@/lib/supabase-server' || (typeof source === 'string' && source.endsWith('/supabase-server'))) {
                    context.report({ node, messageId: 'supabaseServer' })
                }
            },
            CallExpression(node) {
                const callee = node.callee
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
