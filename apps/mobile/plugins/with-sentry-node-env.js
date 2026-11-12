const { withXcodeProject } = require('@expo/config-plugins')

// The Sentry Expo plugin's "Upload Debug Symbols to Sentry" build phase runs
// `${NODE_BINARY:-node}` without ever sourcing .xcode.env or .xcode.env.local
// first (unlike the "Bundle React Native code and images" phase, which does),
// so NODE_BINARY is unset there and it falls back to bare `node` — not on
// Xcode's build-phase PATH for an nvm-managed install. Prepend the same two
// `source` lines the bundle phase already uses successfully.
//
// Must be registered BEFORE "@sentry/react-native/expo" in app.json's
// `plugins` array, counter-intuitively: @expo/config-plugins' withMod runs
// each newly-registered mod's own action BEFORE calling into the mod chain
// registered ahead of it (see withMod.js — `action` runs, then `nextMod`).
// So the LAST-registered withXcodeProject call for a given mod type is the
// FIRST to execute. Registering this plugin before Sentry's makes it the
// earlier link in that chain, so it runs AFTER Sentry's callback has
// already added the phase this looks for.
const PHASE_NAME = '"Upload Debug Symbols to Sentry"'
const PREAMBLE = [
  'if [[ -f "$SRCROOT/.xcode.env" ]]; then',
  '  source "$SRCROOT/.xcode.env"',
  'fi',
  'if [[ -f "$SRCROOT/.xcode.env.local" ]]; then',
  '  source "$SRCROOT/.xcode.env.local"',
  'fi',
  '',
].join('\n')

function escapeForPbxproj(script) {
  return script.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

const withSentryNodeEnv = config => withXcodeProject(config, config => {
  const phases = config.modResults.hash.project.objects.PBXShellScriptBuildPhase || {}
  for (const phase of Object.values(phases)) {
    if (!phase || typeof phase !== 'object' || phase.name !== PHASE_NAME) continue
    if (typeof phase.shellScript !== 'string' || !phase.shellScript.startsWith('"')) continue
    if (phase.shellScript.includes('.xcode.env')) continue // already patched
    const inner = phase.shellScript.slice(1, -1)
    phase.shellScript = `"${escapeForPbxproj(PREAMBLE)}${inner}"`
  }
  return config
})

module.exports = withSentryNodeEnv
