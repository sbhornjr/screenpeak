// drive mobile-settings: the recipe is ../features/mobile-settings.md.
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { startExpo, stopExpo } from '../apps.mjs'
import { connectChrome, launchChrome, stopChrome } from '../browser.mjs'
import {
    appPort, databaseUrl, deletionPath, dropEmail, dropPassword, dropUsername, evidenceRoot, expoPort,
    peekEmail, peekPassword, peekUsername,
} from '../config.mjs'
import { psql } from '../database.mjs'
import { readPublicEnv, serviceKeyWritten } from '../env.mjs'
import { peekLibraryGames, sqlLiteral, sqlNullable } from '../fixtures.mjs'
import { fail, log, portOpen, requireDoctor, waitForHttp } from '../runtime.mjs'

const TITLE = 'Soulslike Sicko'
const BIO = 'Settings drive bio: roguelikes on the train, RPGs at home.'
const RENAMED = 'peek_settings'
const NEW_PASSWORD = 'local-peek-new-1'
const NEW_EMAIL = 'hornflakes+peeknew@mail.grokbot.com'
const PEEK_COLUMNS = ['username', 'user_bio', 'selected_title', 'library_public', 'default_list_public', 'loadout_public']

function peekValue(column) {
    return psql(databaseUrl, `select coalesce(${column}::text, '') from users where id = (select id from auth.users where email = '${peekEmail}')`, ['-tA'])
}

function savePeek() {
    return Object.fromEntries(PEEK_COLUMNS.map((column) => [column, peekValue(column)]))
}

function restorePeek(saved) {
    psql(databaseUrl, `
        UPDATE users SET
            username = ${sqlLiteral(saved.username)},
            user_bio = ${sqlNullable(saved.user_bio)},
            selected_title = ${sqlNullable(saved.selected_title)},
            library_public = ${saved.library_public === 'false' ? 'false' : 'true'},
            default_list_public = ${saved.default_list_public === 'false' ? 'false' : 'true'},
            loadout_public = ${saved.loadout_public === 'false' ? 'false' : 'true'}
        WHERE id = (SELECT id FROM auth.users WHERE email = '${peekEmail}');
    `)
    restorePeekPassword()
}

function restorePeekPassword() {
    psql(databaseUrl, `
        UPDATE verify_local.passwords SET password = '${peekPassword}'
        WHERE user_id = (SELECT id FROM auth.users WHERE email = '${peekEmail}');
    `)
}

function storedPassword(email) {
    return psql(databaseUrl, `select password from verify_local.passwords where user_id = (select id from auth.users where email = '${email}')`, ['-tA'])
}

function insertDrop(games) {
    psql(databaseUrl, `
        INSERT INTO auth.users (id, email, raw_user_meta_data)
        SELECT gen_random_uuid(), '${dropEmail}', '{"username":"${dropUsername}"}'::jsonb
        WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = '${dropEmail}');
        INSERT INTO verify_local.passwords (user_id, password)
        SELECT id, '${dropPassword}' FROM auth.users WHERE email = '${dropEmail}'
        ON CONFLICT (user_id) DO UPDATE SET password = EXCLUDED.password;
        INSERT INTO ratings_reviews (user_id, game_id, rating)
        SELECT u.id, '${games[0].id}'::uuid, 7 FROM users u WHERE u.username = '${dropUsername}';
    `)
}

function deleteDrop() {
    try {
        psql(databaseUrl, `
            DELETE FROM verify_local.passwords WHERE user_id IN (SELECT id FROM auth.users WHERE email = '${dropEmail}');
            DELETE FROM auth.users WHERE email = '${dropEmail}';
        `)
    } catch (error) {
        log(error instanceof Error ? error.message : String(error))
    }
}

function dropRows() {
    const line = psql(databaseUrl, `
        select concat_ws(',',
            (select count(*) from auth.users where email = '${dropEmail}'),
            (select count(*) from users where username = '${dropUsername}'),
            (select count(*) from ratings_reviews rr join users u on u.id = rr.user_id where u.username = '${dropUsername}'))
    `, ['-tA'])
    const [auth, profile, ratings] = line.split(',').map(Number)
    return { auth, profile, ratings }
}

function deletions() {
    try { return JSON.parse(readFileSync(deletionPath, 'utf8')) } catch { return [] }
}

export async function driveMobileSettings() {
    requireDoctor()
    if (await portOpen(expoPort)) fail(`Port ${expoPort} is already in use. Not starting Expo.`)
    if (!serviceKeyWritten()) fail('apps/web/.env.local has no local SUPABASE_SECRET_KEY. Run down and up again.')
    const games = peekLibraryGames()
    if (games.length < 1) fail('peek needs a library game before the settings drive.')
    const publicEnv = readPublicEnv()
    const dir = join(evidenceRoot, 'mobile-settings')
    await mkdir(dir, { recursive: true })
    const origin = `http://127.0.0.1:${appPort}`
    const expoOrigin = `http://localhost:${expoPort}`
    const problems = []
    const shots = {}
    const postgres = {}
    let page = null
    let chromePid = null
    let expoPid = null
    let code = 0
    const saved = savePeek()
    try {
        deleteDrop()
        insertDrop(games)
        expoPid = startExpo(origin, publicEnv)
        await waitForHttp(expoOrigin, 180_000)
        chromePid = await launchChrome()
        page = await connectChrome()

        async function shot(name) {
            const path = join(dir, name)
            await page.screenshot(path)
            shots[name] = path
            if (!(await page.ariaLabels()).includes('ScreenPeak')) problems.push(`${name} is missing ScreenPeak`)
            return page.bodyText()
        }
        async function waitForPath(path) {
            await page.waitUntil(`location.pathname === ${JSON.stringify(path)} ? 'ok' : location.pathname`, 30_000)
        }
        // Postgres is read in this process, so poll it here, not in the page.
        async function waitForValue(read, expected, what) {
            const deadline = Date.now() + 30_000
            let value = read()
            while (value !== expected && Date.now() < deadline) {
                await new Promise((resolve) => setTimeout(resolve, 250))
                value = read()
            }
            if (value !== expected) throw new Error(`${what} is ${JSON.stringify(value)}, not ${JSON.stringify(expected)}`)
            return value
        }
        // A sheet's own button, not the row behind it with the same text.
        async function clickInSheet(name) {
            const outcome = await page.evaluate(`(() => {
                const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter((item) => item.getClientRects().length > 0)
                const dialog = dialogs.at(-1)
                if (!dialog) return 'no sheet'
                const node = [...dialog.querySelectorAll('button, [role="button"]')].find((item) => item.textContent.trim() === ${JSON.stringify(name)})
                if (!node) return 'missing'
                node.click()
                return 'clicked'
            })()`)
            if (outcome !== 'clicked') throw new Error(`Could not click ${name} in the sheet (${outcome})`)
        }
        async function signIn(email, password) {
            await page.navigate(`${expoOrigin}/sign-in`)
            await page.waitForText('Log in')
            await page.fillPlaceholder('Email', email)
            await page.fillPlaceholder('Password', password)
            await page.clickControl('Log in')
            await page.waitUntil(`location.pathname.includes('sign-in') ? 'waiting' : 'ok'`, 30_000)
            await page.waitUntil(`document.querySelector('[role="tab"]') ? 'ok' : 'waiting'`, 30_000)
        }

        // Signed out, Settings asks you to log in.
        await page.setViewport(375, 667)
        await page.navigate(`${expoOrigin}/settings`)
        await page.waitForText('Log in to change your settings.', 180_000)

        // Settings on the Profile tab opens the real screen.
        await signIn(peekEmail, peekPassword)
        await page.navigate(`${expoOrigin}/profile`)
        await page.waitUntil(`document.querySelector('[aria-label="Settings"]') ? 'ok' : 'waiting'`, 45_000)
        await page.clickLabel('Settings')
        await waitForPath('/settings')
        await page.waitForText('Danger zone', 30_000)
        const first = await shot('settings-375.png')
        for (const line of ['Profile', 'Account', 'Privacy', peekEmail, 'Change photo', 'Sign out']) {
            if (!first.includes(line)) problems.push(`Settings is missing "${line}"`)
        }
        await page.setViewport(320, 568)
        await shot('settings-320.png')
        await page.setViewport(375, 667)

        // Title and bio.
        await page.clickLabel('Change title')
        await page.waitForText('Select title')
        await clickInSheet(TITLE)
        postgres.title = await waitForValue(() => peekValue('selected_title'), TITLE, 'selected_title')
        await page.clickLabel('Edit bio')
        await page.waitForText('Save bio')
        await page.fillLabel('Bio', BIO)
        await clickInSheet('Save bio')
        postgres.bio = await waitForValue(() => peekValue('user_bio'), BIO, 'user_bio')
        await page.waitForText(BIO, 30_000)

        // A privacy flag.
        const libraryBefore = peekValue('library_public')
        const libraryAfter = libraryBefore === 'true' ? 'false' : 'true'
        await page.clickLabel('Library public')
        postgres.libraryPublic = { before: libraryBefore, after: await waitForValue(() => peekValue('library_public'), libraryAfter, 'library_public') }

        // Username, then back.
        await page.clickLabel('Change username')
        await page.fillLabel('New username', 'no spaces')
        await clickInSheet('Save username')
        await page.waitForText('Usernames can only contain letters, numbers, and underscores')
        await page.fillLabel('New username', RENAMED)
        await clickInSheet('Save username')
        postgres.renamed = await waitForValue(() => peekValue('username'), RENAMED, 'username')
        await page.waitForText(RENAMED, 30_000)
        await shot('renamed-375.png')
        await page.clickLabel('Change username')
        await page.fillLabel('New username', peekUsername)
        await clickInSheet('Save username')
        postgres.restoredName = await waitForValue(() => peekValue('username'), peekUsername, 'username')

        // Email: Auth sends a link, and the address stays until it is followed.
        await page.clickLabel('Change email')
        await page.fillLabel('New email', NEW_EMAIL)
        await clickInSheet('Send confirmation link')
        await page.waitForText(`Check ${NEW_EMAIL} for a link to confirm the change.`, 30_000)
        postgres.emailAfter = psql(databaseUrl, `select email from auth.users where id = (select id from users where username = '${peekUsername}')`, ['-tA'])
        if (postgres.emailAfter !== peekEmail) problems.push(`the email changed before confirmation (${postgres.emailAfter})`)
        await clickInSheet('Done')

        // Password: a wrong current password changes nothing; the right one does.
        await page.clickLabel('Change password')
        await page.fillLabel('Current password', 'not-the-password')
        await page.fillLabel('New password', NEW_PASSWORD)
        await page.fillLabel('Confirm new password', NEW_PASSWORD)
        await clickInSheet('Change password')
        await page.waitForText('Current password is incorrect.', 30_000)
        if (storedPassword(peekEmail) !== peekPassword) problems.push('a wrong current password changed the password')
        await page.fillLabel('Current password', peekPassword)
        await clickInSheet('Change password')
        await page.waitForText('Password changed.', 30_000)
        postgres.passwordChanged = storedPassword(peekEmail) === NEW_PASSWORD
        if (!postgres.passwordChanged) problems.push('verify_local.passwords does not have the new password')
        await clickInSheet('Done')
        restorePeekPassword()

        // Sign out lands on the signed-out home.
        await page.clickControl('Sign out')
        await waitForPath('/')
        await page.waitForText('Sign up, log in, or browse the catalogue.', 30_000)

        // Delete a throwaway account. It asks first.
        await signIn(dropEmail, dropPassword)
        await page.navigate(`${expoOrigin}/settings`)
        await page.waitForText('Danger zone', 45_000)
        postgres.dropBefore = dropRows()
        await page.clickControl('Delete account')
        await page.waitForText('Delete your account?')
        await shot('delete-confirm-375.png')
        await clickInSheet('Keep my account')
        if (dropRows().auth !== 1) problems.push('Keep my account deleted the account')
        await page.clickControl('Delete account')
        await page.waitForText('Delete your account?')
        await clickInSheet('Delete account')
        await waitForPath('/')
        await page.waitForText('Sign up, log in, or browse the catalogue.', 30_000)
        postgres.dropAfter = dropRows()
        if (postgres.dropAfter.auth || postgres.dropAfter.profile || postgres.dropAfter.ratings) {
            problems.push(`the deleted account left rows: ${JSON.stringify(postgres.dropAfter)}`)
        }
        postgres.gatewayDeletions = deletions().filter((item) => item.email === dropEmail).length
        if (!postgres.gatewayDeletions) problems.push('the gateway recorded no admin delete')
        await shot('deleted-375.png')

        await writeFile(join(dir, 'result.json'), JSON.stringify({ feature: 'mobile-settings', expo: expoOrigin, shots, postgres, problems }, null, 2))
    } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error))
        try { await page?.screenshot(join(dir, 'failed.png')) } catch { /* the page may already be gone */ }
        try {
            await writeFile(join(dir, 'result.json'), JSON.stringify({ feature: 'mobile-settings', shots, postgres, problems }, null, 2))
        } catch { /* evidence dir may be missing */ }
        code = 1
    } finally {
        page?.close()
        stopChrome(chromePid)
        stopExpo(expoPid)
        deleteDrop()
        try { restorePeek(saved) } catch (error) { log(error instanceof Error ? error.message : String(error)) }
    }
    if (problems.length) console.error(problems.join('\n'))
    if (code !== 0 || problems.length) process.exit(code || 1)
    log(`proved mobile-settings evidence ${dir}`)
}
