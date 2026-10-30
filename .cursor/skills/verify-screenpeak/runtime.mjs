// Process, pid-file, and logging plumbing shared by every command.
import { spawn, spawnSync } from 'node:child_process'
import { closeSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { join } from 'node:path'
import { logDir, pidDir, root, runDir, scriptPath, statePath } from './config.mjs'

export function log(message) {
    console.log(message)
}

export function fail(message) {
    console.error(message)
    process.exit(1)
}

export async function readState() {
    try {
        return JSON.parse(await readFile(statePath, 'utf8'))
    } catch {
        return null
    }
}

export async function writeState(state) {
    await mkdir(runDir, { recursive: true })
    await writeFile(statePath, JSON.stringify(state, null, 2))
}

export function portOpen(port) {
    return new Promise((resolve) => {
        const socket = createConnection({ port, host: '127.0.0.1' })
        const done = (open) => {
            socket.removeAllListeners()
            socket.destroy()
            resolve(open)
        }
        socket.once('connect', () => done(true))
        socket.once('error', () => done(false))
    })
}

export function spawnLogged(name, command, args, env) {
    mkdirSyncSafe(logDir)
    mkdirSyncSafe(pidDir)
    const logPath = join(logDir, `${name}.log`)
    const fd = openSync(logPath, 'a')
    const child = spawn(command, args, {
        cwd: root,
        detached: true,
        stdio: ['ignore', fd, fd],
        env: { ...process.env, ...env },
    })
    closeSync(fd)
    child.unref()
    writeFileSync(join(pidDir, name), String(child.pid))
    return child.pid
}

export function mkdirSyncSafe(path) {
    spawnSync('mkdir', ['-p', path])
}

export function pidAlive(pid) {
    if (!pid) return false
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

export function readPid(name) {
    try {
        return Number(readFileSync(join(pidDir, name), 'utf8').trim())
    } catch {
        return null
    }
}

export function stopRecorded(name) {
    const pid = readPid(name)
    if (!pid) return
    try { process.kill(-pid, 'SIGTERM') } catch { /* already gone */ }
    try { process.kill(pid, 'SIGTERM') } catch { /* already gone */ }
    try { unlinkSyncSafe(join(pidDir, name)) } catch { /* ignore */ }
}

function unlinkSyncSafe(path) {
    spawnSync('rm', ['-f', path])
}

export async function waitForHttp(url, timeoutMs) {
    const started = Date.now()
    let last = ''
    while (Date.now() - started < timeoutMs) {
        try {
            const response = await fetch(url)
            if (response.ok) return
            last = `${response.status}`
        } catch (error) {
            last = error instanceof Error ? error.message : String(error)
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
    }
    throw new Error(`Timed out waiting for ${url} (${last}). See ${logDir}.`)
}

export function requireDoctor() {
    const doctorRun = spawnSync(process.execPath, [scriptPath, 'doctor'], { encoding: 'utf8' })
    process.stdout.write(doctorRun.stdout || '')
    if (doctorRun.status !== 0) fail('Doctor failed. Not driving.')
}
