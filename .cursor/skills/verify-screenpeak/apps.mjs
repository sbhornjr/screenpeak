// Launching the Next.js website and the Expo web app.
import { appPort, expoPort } from './config.mjs'
import { spawnLogged, stopRecorded } from './runtime.mjs'

export function startNext() {
    return spawnLogged('next', 'npm', ['run', 'dev', '--', '-H', '127.0.0.1', '-p', String(appPort)], {})
}

export function startExpo(origin, publicEnv) {
    return spawnLogged('expo', 'npm', ['run', 'web', '-w', '@screenpeak/mobile', '--', '--host', 'localhost', '--port', String(expoPort)], {
        CI: '1',
        BROWSER: 'none',
        EXPO_NO_TELEMETRY: '1',
        EXPO_PUBLIC_API_URL: origin,
        EXPO_PUBLIC_SUPABASE_URL: publicEnv.url,
        EXPO_PUBLIC_SUPABASE_ANON_KEY: publicEnv.anon,
    })
}

export function stopExpo(expoPid) {
    stopRecorded('expo')
    if (expoPid) {
        try { process.kill(-expoPid, 'SIGTERM') } catch { /* already stopped */ }
        try { process.kill(expoPid, 'SIGTERM') } catch { /* already stopped */ }
    }
}
