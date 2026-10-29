// Per-weight entry points, NOT the package index: importing from
// '@expo-google-fonts/chakra-petch' bundles every weight + italic (38 files across
// the three families) even though we load 10.
import { ChakraPetch_400Regular } from '@expo-google-fonts/chakra-petch/400Regular'
import { ChakraPetch_500Medium } from '@expo-google-fonts/chakra-petch/500Medium'
import { ChakraPetch_600SemiBold } from '@expo-google-fonts/chakra-petch/600SemiBold'
import { ChakraPetch_700Bold } from '@expo-google-fonts/chakra-petch/700Bold'
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono/400Regular'
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono/500Medium'
import { IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono/600SemiBold'
import { IBMPlexSans_400Regular } from '@expo-google-fonts/ibm-plex-sans/400Regular'
import { IBMPlexSans_500Medium } from '@expo-google-fonts/ibm-plex-sans/500Medium'
import { IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans/600SemiBold'
import type { FontRole } from '@screenpeak/shared/tokens'

/** Passed to `useFonts()` in the root layout — the same weights the web loads. */
export const fontFiles = {
  ChakraPetch_400Regular,
  ChakraPetch_500Medium,
  ChakraPetch_600SemiBold,
  ChakraPetch_700Bold,
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
}

type FaceName = keyof typeof fontFiles

/**
 * Role + weight → loaded font name. Each weight is its own font file, so on
 * native you pick the weight by `fontFamily` and leave `fontWeight` unset —
 * setting `fontWeight` makes iOS fake-bold the Regular face instead.
 *
 * `face.mono[600]` ≈ web `font-mono font-semibold`. Mono only ships to 600 (the
 * web loads the same three weights), so the web's `font-mono font-bold` Seal
 * number renders as 600 there too.
 */
export const face = {
  display: {
    400: 'ChakraPetch_400Regular',
    500: 'ChakraPetch_500Medium',
    600: 'ChakraPetch_600SemiBold',
    700: 'ChakraPetch_700Bold',
  },
  body: {
    400: 'IBMPlexSans_400Regular',
    500: 'IBMPlexSans_500Medium',
    600: 'IBMPlexSans_600SemiBold',
  },
  mono: {
    400: 'IBMPlexMono_400Regular',
    500: 'IBMPlexMono_500Medium',
    600: 'IBMPlexMono_600SemiBold',
  },
} as const satisfies Record<FontRole, Record<number, FaceName>>
