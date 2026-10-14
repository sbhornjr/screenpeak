import { defineConfig } from 'vitest/config'
export default defineConfig({
    resolve: { alias: {
        '@': import.meta.dirname,
        'server-only': `${import.meta.dirname}/test/stubs/server-only.ts`,
    } },
    test: {
        environment: 'node', setupFiles: ['test/setup.ts'],
        include: ['test/integration/*.integration.ts'],
        fileParallelism: false, testTimeout: 30_000, hookTimeout: 30_000,
    },
})
