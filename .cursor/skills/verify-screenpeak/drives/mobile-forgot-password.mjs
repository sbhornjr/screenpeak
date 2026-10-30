// drive mobile-forgot-password: the recipe is ../features/mobile-forgot-password.md.
import { readFileSync, writeFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { startExpo, stopExpo } from '../apps.mjs'
import { connectChrome, launchChrome, stopChrome } from '../browser.mjs'
import {
    appPort, databaseUrl, evidenceRoot, expoPort, gatewayPort, recoveryPath, resetEmail, resetNewPassword,
    resetOldPassword, resetUsername,
} from '../config.mjs'
import { psql } from '../database.mjs'
import { readPublicEnv } from '../env.mjs'
import { fail, log, portOpen, requireDoctor, waitForHttp } from '../runtime.mjs'

function insertResetUser() {
    psql(databaseUrl, `
        INSERT INTO auth.users (id, email, raw_user_meta_data)
        SELECT gen_random_uuid(), '${resetEmail}', '{"username":"${resetUsername}"}'::jsonb
        WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = '${resetEmail}');
        INSERT INTO verify_local.passwords (user_id, password)
        SELECT id, '${resetOldPassword}' FROM auth.users WHERE email = '${resetEmail}'
        ON CONFLICT (user_id) DO UPDATE SET password = EXCLUDED.password;
        UPDATE public.users
        SET username = '${resetUsername}', display_name = '${resetUsername}'
        WHERE id = (SELECT id FROM auth.users WHERE email = '${resetEmail}');
    `)
}

function deleteResetUser() {
    try {
        psql(databaseUrl, `DELETE FROM auth.users WHERE email = '${resetEmail}';`)
    } catch (error) {
        log(error instanceof Error ? error.message : String(error))
    }
}

function clearRecoveryFile() {
    writeFileSync(recoveryPath, '[]\n')
}

function readRecovery() {
    try {
        return JSON.parse(readFileSync(recoveryPath, 'utf8'))
    } catch {
        return []
    }
}

async function postRecover(email) {
    const response = await fetch(`http://127.0.0.1:${gatewayPort}/auth/v1/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
    })
    const body = await response.text()
    return { status: response.status, body }
}

export async function driveForgotPassword() {
    requireDoctor()
    if (await portOpen(expoPort)) fail(`Port ${expoPort} is already in use. Not starting Expo.`)
    const publicEnv = readPublicEnv()
    const dir = join(evidenceRoot, 'mobile-forgot-password')
    await mkdir(dir, { recursive: true })
    insertResetUser()
    clearRecoveryFile()
    const knownRecover = await postRecover(resetEmail)
    const unknownRecover = await postRecover('nobody-reset@example.com')
    clearRecoveryFile()
    const origin = `http://127.0.0.1:${appPort}`
    const expoOrigin = `http://localhost:${expoPort}`
    const expoPid = startExpo(origin, publicEnv)
    const problems = []
    const shots = {}
    const confirmation = 'If that email has an account, a reset link is on its way.'
    let page = null
    let chromePid = null
    let code = 0
    let storedPasswordMatches = false
    let oldPasswordRejected = false
    let repeatDisabled = false
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

        await page.navigate(expoOrigin)
        const welcome = await shot('signed-out-home.png', 'Sign up, log in, or browse the catalogue.', 180_000)
        if (!welcome.includes('Welcome')) problems.push('signed-out home is missing Welcome')

        await page.navigate(`${expoOrigin}/auth/update-password`)
        const blocked = await shot('update-without-link.png', 'This page only works from the reset link in your email.')
        if (!blocked.includes('Request a new link')) problems.push('set-new-password without a session hides Request a new link')
        if (!blocked.includes('Back')) problems.push('set-new-password is missing Back')

        await page.navigate(`${expoOrigin}/sign-in`)
        await page.waitForText('Forgot password?')
        await page.clickControl('Forgot password?')
        await page.waitForText('Reset password')
        await page.clickControl('Back')
        await page.waitForText('Forgot password?')
        await page.clickControl('Forgot password?')
        const request = await shot('request.png', 'Send reset link')
        if (!request.includes('Reset password')) problems.push('request screen is missing Reset password')
        if (!request.includes('Back')) problems.push('request screen is missing Back')

        await page.fillPlaceholder('Email', resetEmail)
        await page.clickControl('Send reset link')
        const confirmed = await shot('confirmation.png', confirmation)
        if (confirmed.includes('not found') || confirmed.includes('does not exist')) problems.push('confirmation names whether the account exists')
        repeatDisabled = await page.evaluate(`(() => {
            const buttons = [...document.querySelectorAll('button')].filter((item) => item.getClientRects().length > 0)
            const button = buttons.find((item) => item.textContent.trim() === 'Send reset link')
            return button && button.disabled ? 'yes' : 'no'
        })()`) === 'yes'
        if (!repeatDisabled) problems.push('Send reset link stayed enabled after the confirmation')
        await page.clickControl('Send reset link')
        const recovery = readRecovery().filter((entry) => entry.email === resetEmail && entry.code)
        if (recovery.length !== 1) problems.push(`expected one reset code, found ${recovery.length}`)
        const entry = recovery[0]
        if (!entry?.redirectTo?.startsWith(`${expoOrigin}/auth/confirm?next=/auth/update-password`)) {
            problems.push(`redirect was ${entry?.redirectTo || 'missing'}`)
        }
        if (!entry?.code) throw new Error('The local gateway did not record a reset code.')
        if (!entry.challenge) problems.push('reset request did not send a PKCE challenge')
        const link = new URL(entry.redirectTo)
        link.searchParams.set('code', entry.code)

        await page.navigate(link.toString())
        const form = await shot('update-password.png', 'Set a new password', 45_000)
        const newPasswordField = await page.evaluate(`(() => {
            const inputs = [...document.querySelectorAll('input[placeholder="New password"]')].filter((item) => item.getClientRects().length > 0)
            return inputs.length ? 'yes' : 'no'
        })()`)
        if (newPasswordField !== 'yes') problems.push('set-new-password is missing the new password field')
        if (form.includes('This page only works from the reset link')) problems.push('the reset link did not start a recovery session')
        await page.fillPlaceholder('New password', resetNewPassword)
        await page.fillPlaceholder('Confirm new password', resetNewPassword)
        await page.clickControl('Update password')
        await shot('updated.png', 'Password updated. Taking you home…')

        await page.evaluate(`localStorage.clear(); 'ok'`)
        await page.navigate(`${expoOrigin}/sign-in`)
        await page.waitForText('Log in')
        await page.fillPlaceholder('Email', resetEmail)
        await page.fillPlaceholder('Password', resetOldPassword)
        await page.clickControl('Log in')
        await page.waitForText('Invalid login credentials')
        oldPasswordRejected = true
        await page.fillPlaceholder('Password', resetNewPassword)
        await page.clickControl('Log in')
        await page.waitUntil(`(() => {
            for (let i = 0; i < localStorage.length; i += 1) {
                const key = localStorage.key(i) || ''
                if (key.includes('auth-token') && localStorage.getItem(key)) return 'ok'
            }
            return 'waiting'
        })()`)
        await page.navigate(expoOrigin)
        await page.waitForText('Nothing in your feed yet.', 45_000)
        const signedIn = await shot('signed-in.png', 'Nothing in your feed yet.')
        if (signedIn.includes('Sign up, log in, or browse the catalogue.')) problems.push('signing in with the new password still shows the welcome')

        await page.navigate(`${expoOrigin}/auth/update-password`)
        const normal = await shot('normal-session.png', 'This page only works from the reset link in your email.')
        const normalField = await page.evaluate(`(() => {
            const inputs = [...document.querySelectorAll('input[placeholder="New password"]')].filter((item) => item.getClientRects().length > 0)
            return inputs.length ? 'yes' : 'no'
        })()`)
        if (normalField === 'yes') problems.push('a normal session can set a new password')
        if (!normal.includes('Request a new link')) problems.push('a normal session hides Request a new link')

        const stored = psql(databaseUrl, `select password from verify_local.passwords where user_id = (select id from auth.users where email = '${resetEmail}')`, ['-tA'])
        storedPasswordMatches = stored === resetNewPassword
        if (!storedPasswordMatches) problems.push('verify_local.passwords does not have the new password')
        if (knownRecover.status !== 200 || knownRecover.body !== unknownRecover.body) {
            problems.push('recover responses differ for an existing and a missing email')
        }
        await writeFile(join(dir, 'result.json'), JSON.stringify({
            feature: 'mobile-forgot-password',
            expo: expoOrigin,
            shots,
            confirmation,
            recoverStatus: { known: knownRecover.status, unknown: unknownRecover.status },
            recoverBodiesMatch: knownRecover.status === 200 && knownRecover.body === unknownRecover.body,
            redirectTo: entry.redirectTo,
            pkceChallenge: Boolean(entry.challenge),
            repeatDisabled,
            oldPasswordRejected,
            storedPasswordMatches,
            problems,
        }, null, 2))
    } catch (error) {
        try { await page?.screenshot(join(dir, 'failed.png')) } catch { /* the page may already be gone */ }
        console.error(error instanceof Error ? error.message : String(error))
        code = 1
        try {
            await writeFile(join(dir, 'result.json'), JSON.stringify({
                feature: 'mobile-forgot-password',
                shots,
                problems,
                error: error instanceof Error ? error.message : String(error),
            }, null, 2))
        } catch { /* evidence dir may be missing */ }
    } finally {
        page?.close()
        stopChrome(chromePid)
        stopExpo(expoPid)
        deleteResetUser()
    }
    if (code !== 0) process.exit(code)
    if (problems.length) {
        console.error(problems.join('\n'))
        process.exit(1)
    }
    log(`proved mobile-forgot-password evidence ${dir}`)
}
