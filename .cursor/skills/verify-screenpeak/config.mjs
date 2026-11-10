// Paths, ports, and fixture accounts shared by every part of the harness.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
export const runDir = '/tmp/screenpeak-verify'
export const evidenceRoot = join(runDir, 'evidence')
export const pidDir = join(runDir, 'pids')
export const logDir = join(runDir, 'logs')
export const statePath = join(runDir, 'state.json')
export const envPath = join(root, 'apps/web/.env.local')
export const envMarker = 'verify-screenpeak local stack'
export const dbName = 'screenpeak_verify_copy'
export const dbUser = 'screenpeak'
export const dbPassword = 'screenpeak'
export const authenticatorPassword = 'verify-authenticator'
export const appPort = 3210
export const gatewayPort = 54321
export const postgrestPort = 54322
export const peekEmail = 'hornflakes+peek@mail.grokbot.com'
export const peekPassword = 'peekpeek'
export const peekUsername = 'peek'
export const adaEmail = 'hornflakes+ada@mail.grokbot.com'
export const adaUsername = 'ada'
export const novaEmail = 'hornflakes+nova@mail.grokbot.com'
export const novaUsername = 'nova'
export const resetEmail = 'hornflakes+reset@mail.grokbot.com'
export const resetUsername = 'resetfan'
export const resetOldPassword = 'local-old-1'
export const resetNewPassword = 'local-new-1'
export const dropEmail = 'hornflakes+drop@mail.grokbot.com'
export const dropUsername = 'dropfan'
export const dropPassword = 'local-drop-1'
export const expoPort = 8081
export const catalogueTop = 100
export const libraryPath = join(runDir, 'library.json')
export const recoveryPath = join(runDir, 'recovery.json')
export const signupPath = join(runDir, 'signups.json')
export const deletionPath = join(runDir, 'deletions.json')
export const signupEmail = 'hornflakes+signup@mail.grokbot.com'
export const signupUsername = 'signupfan'
export const signupPassword = 'local-signup-1'
export const postgrestVersion = 'v16.4'
export const postgrestUrl = `https://github.com/PostgREST/postgrest/releases/download/${postgrestVersion}/postgrest-${postgrestVersion}-linux-static-x86-64.tar.xz`

export const databaseUrl = `postgresql://${dbUser}:${dbPassword}@127.0.0.1:5432/${dbName}`

// The entry point. Drives re-run it as `doctor`, and up forks it as `gateway`.
export const scriptPath = join(dirname(fileURLToPath(import.meta.url)), 'verify-screenpeak.mjs')
