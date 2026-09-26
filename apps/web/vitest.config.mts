import { defineConfig } from 'vitest/config'

// Test runner config. Deliberately isolated from next.config.ts / tsconfig
// build settings — the suite only needs the `@/*` path alias resolved.
export default defineConfig({
    resolve: {
        alias: { '@': import.meta.dirname },
    },
    test: {
        globals: true,
        // Default to node; component/DOM specs opt in with a
        // `// @vitest-environment jsdom` docblock at the top of the file.
        environment: 'node',
        setupFiles: ['test/setup.ts'],
        include: ['test/**/*.test.{ts,tsx}'],
        clearMocks: true,
        restoreMocks: true,
        unstubGlobals: true,
        unstubEnvs: true,
    },
})
