import { defineConfig } from 'vitest/config'

export default defineConfig({
    resolve: {
        alias: {
            '@': `${import.meta.dirname}/src`,
            // lucide-react-native pulls in react-native's Flow entry, which Vitest cannot parse.
            'lucide-react-native': `${import.meta.dirname}/test/lucide-react-native.tsx`,
            // expo-haptics pulls in Expo's native-module setup, which references
            // __DEV__ and other Metro/React Native globals Vitest never defines.
            'expo-haptics': `${import.meta.dirname}/test/expo-haptics.ts`,
        },
    },
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
})
