// drive mobile-sign-up: the recipe is ../features/mobile-sign-up.md.
import { readFileSync, writeFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { startExpo, stopExpo } from '../apps.mjs'
import { connectChrome, launchChrome, stopChrome } from '../browser.mjs'
import {
    appPort, databaseUrl, evidenceRoot, expoPort, gatewayPort, signupEmail, signupPassword, signupPath,
    signupUsername,
} from '../config.mjs'
import { psql } from '../database.mjs'
import { readPublicEnv } from '../env.mjs'
import { fail, log, portOpen, requireDoctor, waitForHttp } from '../runtime.mjs'

function deleteSignupUser() {
    try {
        psql(databaseUrl, `DELETE FROM auth.users WHERE email = '${signupEmail}';`)
    } catch (error) {
        log(error instanceof Error ? error.message : String(error))
    }
}

function readSignups() {
    try {
        return JSON.parse(readFileSync(signupPath, 'utf8'))
    } catch {
        return []
    }
}

export async function driveSignUp() {
    requireDoctor()
    if (await portOpen(expoPort)) fail(`Port ${expoPort} is already in use. Not starting Expo.`)
    const publicEnv = readPublicEnv()
    const dir = join(evidenceRoot, 'mobile-sign-up')
    await mkdir(dir, { recursive: true })
    deleteSignupUser()
    writeFileSync(signupPath, '[]\n')
    const origin = `http://127.0.0.1:${appPort}`
    const expoOrigin = `http://localhost:${expoPort}`
    const expoPid = startExpo(origin, publicEnv)
    const problems = []
    const shots = {}
    const notice = 'Check your email to confirm the account, then log in.'
    let page = null
    let chromePid = null
    let code = 0
    let signupChallenge = undefined
    let confirmed = false
    let signedIn = false
    try {
        await waitForHttp(expoOrigin, 180_000)
        chromePid = await launchChrome()
        page = await connectChrome()

        async function shot(name, needle, timeoutMs = 30_000) {
            await page.waitForText(needle, timeoutMs)
            const path = join(dir, name)
            await page.screenshot(path)
            shots[name] = path
            return page.bodyText()
        }

        await page.navigate(`${expoOrigin}/sign-up`)
        const form = await shot('request.png', 'Sign up', 180_000)
        const usernameField = await page.evaluate(`(() => {
            const inputs = [...document.querySelectorAll('input[placeholder="Username"]')].filter((item) => item.getClientRects().length > 0)
            return inputs.length ? 'yes' : 'no'
        })()`)
        if (usernameField !== 'yes') problems.push('sign-up is missing Username')
        if (!form.includes('Back')) problems.push('sign-up is missing Back')
        await page.fillPlaceholder('Email', signupEmail)
        await page.fillPlaceholder('Username', signupUsername)
        await page.fillPlaceholder('Password', signupPassword)
        await page.clickControl('Sign up')
        const asked = await shot('confirmation.png', notice)
        if (asked.includes('code challenge') || asked.includes('verifier')) problems.push('sign-up confirmation mentions a code verifier')
        const signups = readSignups().filter((entry) => entry.email === signupEmail)
        if (signups.length !== 1) problems.push(`expected one signup, found ${signups.length}`)
        const entry = signups[0] || {}
        signupChallenge = entry.challenge ?? null
        if (signupChallenge !== null) problems.push('sign-up sent a PKCE code challenge')
        if (!entry.token) throw new Error('The local gateway did not record a signup confirmation token.')

        await page.navigate(`${expoOrigin}/sign-in`)
        await page.waitForText('Log in')
        await page.fillPlaceholder('Email', signupEmail)
        await page.fillPlaceholder('Password', signupPassword)
        await page.clickControl('Log in')
        await shot('unconfirmed.png', 'Email not confirmed')

        const verify = await fetch(`http://127.0.0.1:${gatewayPort}/auth/v1/verify?token=${entry.token}&type=signup`)
        confirmed = verify.status === 200
        if (!confirmed) problems.push(`confirmation link returned ${verify.status}`)

        await page.fillPlaceholder('Password', signupPassword)
        await page.clickControl('Log in')
        await page.waitUntil(`(() => {
            for (let i = 0; i < localStorage.length; i += 1) {
                const key = localStorage.key(i) || ''
                if (key.includes('auth-token') && localStorage.getItem(key)) return 'ok'
            }
            return 'waiting'
        })()`)
        await page.navigate(expoOrigin)
        const home = await shot('signed-in.png', 'Nothing in your feed yet.', 45_000)
        signedIn = !home.includes('Sign up, log in, or browse the catalogue.')
        if (!signedIn) problems.push('confirmed sign-up still shows the welcome')

        await writeFile(join(dir, 'result.json'), JSON.stringify({
            feature: 'mobile-sign-up',
            expo: expoOrigin,
            shots,
            notice,
            signupChallenge,
            confirmed,
            signedIn,
            problems,
        }, null, 2))
    } catch (error) {
        try { await page?.screenshot(join(dir, 'failed.png')) } catch { /* the page may already be gone */ }
        console.error(error instanceof Error ? error.message : String(error))
        code = 1
        try {
            await writeFile(join(dir, 'result.json'), JSON.stringify({
                feature: 'mobile-sign-up',
                shots,
                signupChallenge,
                confirmed,
                signedIn,
                problems,
                error: error instanceof Error ? error.message : String(error),
            }, null, 2))
        } catch { /* evidence dir may be missing */ }
    } finally {
        page?.close()
        stopChrome(chromePid)
        stopExpo(expoPid)
        deleteSignupUser()
    }
    if (code !== 0) process.exit(code)
    if (problems.length) {
        console.error(problems.join('\n'))
        process.exit(1)
    }
    log(`proved mobile-sign-up evidence ${dir}`)
}
