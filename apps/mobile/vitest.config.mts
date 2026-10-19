import { defineConfig } from 'vitest/config'

export default defineConfig({
    resolve: {
        alias: {
            '@': `${import.meta.dirname}/src`,
            // lucide-react-native pulls in react-native's Flow entry, which Vitest cannot parse.
            'lucide-react-native': `${import.meta.dirname}/test/lucide-react-native.tsx`,
        },
    },
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
})
