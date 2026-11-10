import { MOBILE_STEAM_RETURN_URL } from '@screenpeak/shared/api/steam'
import { CryptoDigestAlgorithm, CryptoEncoding, digestStringAsync, getRandomBytes } from 'expo-crypto'
import { openAuthSessionAsync } from 'expo-web-browser'

import { api, apiUrl } from './api'
import { pkcePair, type SteamLinkSteps } from './steam-link'

/** Linking with the real crypto, the system browser sheet, and the API. */
export const steamLinkSteps: SteamLinkSteps = {
  pkce: () => pkcePair({
    randomBytes: getRandomBytes,
    sha256Base64: value => digestStringAsync(CryptoDigestAlgorithm.SHA256, value, { encoding: CryptoEncoding.BASE64 }),
  }),
  intent: codeChallenge => api.me.steamLinkIntent({ codeChallenge }),
  open: path => openAuthSessionAsync(apiUrl(path), MOBILE_STEAM_RETURN_URL),
  complete: body => api.me.steamLinkComplete(body),
}
