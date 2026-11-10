// drive mobile-loadout: the recipe is ../features/mobile-loadout.md.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { startExpo, stopExpo } from '../apps.mjs'
import { connectChrome, launchChrome, stopChrome } from '../browser.mjs'
import { appPort, databaseUrl, evidenceRoot, expoPort, novaEmail, novaUsername, peekEmail, peekPassword, peekUsername } from '../config.mjs'
import { psql } from '../database.mjs'
import { readPublicEnv } from '../env.mjs'
import { deleteNova, peekLibraryGames, sqlNullable } from '../fixtures.mjs'
import { fail, log, portOpen, requireDoctor, waitForHttp } from '../runtime.mjs'

// Seeded so Save to profile and Clear can be driven without the Anthropic API.
const SEEDED = 'A patient reader of hard games who forgives a slow first act.'
const UNAVAILABLE = "Couldn't write a Read-out right now. Try again shortly."

function peekColumn(column) {
    return psql(databaseUrl, `select coalesce(${column}::text, '') from users where username = '${peekUsername}'`, ['-tA'])
}

function savePeek() {
    return {
        identity: peekColumn('loadout_identity'),
        identityAt: peekColumn('loadout_identity_at'),
        bio: peekColumn('profile_loadout_bio'),
        loadoutPublic: peekColumn('loadout_public'),
    }
}

function restorePeek(saved) {
    psql(databaseUrl, `
        UPDATE users SET
            loadout_identity = ${sqlNullable(saved.identity)},
            loadout_identity_at = ${saved.identityAt ? `${sqlNullable(saved.identityAt)}::timestamptz` : 'NULL'},
            profile_loadout_bio = ${sqlNullable(saved.bio)},
            loadout_public = ${saved.loadoutPublic === 'false' ? 'false' : 'true'}
        WHERE username = '${peekUsername}';
    `)
}

function seedPeek() {
    // Two minutes ago, so the one-a-minute limit does not block the Generate step.
    psql(databaseUrl, `
        UPDATE users SET
            loadout_identity = '${SEEDED}',
            loadout_identity_at = now() - interval '2 minutes',
            profile_loadout_bio = NULL
        WHERE username = '${peekUsername}';
    `)
}

function insertNova(games) {
    psql(databaseUrl, `
        INSERT INTO auth.users (id, email, raw_user_meta_data)
        SELECT gen_random_uuid(), '${novaEmail}', '{"username":"${novaUsername}"}'::jsonb
        WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = '${novaEmail}');
        UPDATE public.users SET loadout_public = true, library_public = true WHERE username = '${novaUsername}';
        INSERT INTO ratings_reviews (user_id, game_id, rating)
        SELECT u.id, rows.game_id, rows.rating
        FROM users u
        JOIN (VALUES ${games.map((game, i) => `('${game.id}'::uuid, ${9 - i})`).join(', ')}) AS rows(game_id, rating) ON true
        WHERE u.username = '${novaUsername}';
    `)
}

export async function driveMobileLoadout() {
    requireDoctor()
    if (await portOpen(expoPort)) fail(`Port ${expoPort} is already in use. Not starting Expo.`)
    const games = peekLibraryGames()
    if (games.length < 2) fail('peek needs two library games before the loadout drive.')
    const publicEnv = readPublicEnv()
    const dir = join(evidenceRoot, 'mobile-loadout')
    await mkdir(dir, { recursive: true })
    const origin = `http://127.0.0.1:${appPort}`
    const expoOrigin = `http://localhost:${expoPort}`
    const anthropicSet = Boolean(process.env.ANTHROPIC_API_KEY)
    const problems = []
    const shots = {}
    const postgres = {}
    const visits = {}
    let generate = 'not run'
    let page = null
    let chromePid = null
    let expoPid = null
    let code = 0
    const saved = savePeek()
    try {
        deleteNova()
        insertNova(games)
        seedPeek()
        const peekRated = psql(databaseUrl, `select count(*) from ratings_reviews rr join users u on u.id = rr.user_id where u.username = '${peekUsername}'`, ['-tA'])
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

        // Another player's Loadout, signed out: no owner controls.
        await page.setViewport(375, 667)
        await page.navigate(`${expoOrigin}/user/${novaUsername}/loadout`)
        await page.waitForText(`${novaUsername}'s Loadout`, 180_000)
        const visitor = await shot('visitor-375.png')
        if (!visitor.includes('No Read-out yet.')) problems.push('a visitor does not see No Read-out yet.')
        for (const owned of ['Regenerate', 'Generate your Read-out', 'Save to profile', 'Clear my Read-out', 'Find games to rate']) {
            if (await page.controlInView(owned) === 'yes') problems.push(`a visitor sees ${owned}`)
        }
        if (!(await page.ariaLabels()).includes('Rated: 2')) problems.push("nova's Rated stat is not 2")

        await page.navigate(`${expoOrigin}/sign-in`)
        await page.waitForText('Log in')
        await page.fillPlaceholder('Email', peekEmail)
        await page.fillPlaceholder('Password', peekPassword)
        await page.clickControl('Log in')
        await page.waitUntil(`location.pathname.includes('sign-in') ? 'waiting' : 'ok'`, 30_000)
        await page.waitUntil(`document.querySelector('[role="tab"]') ? 'ok' : 'waiting'`, 30_000)

        // The owner's Loadout with the seeded Read-out.
        await page.navigate(`${expoOrigin}/user/${peekUsername}/loadout`)
        await page.waitForText(`“${SEEDED}”`, 45_000)
        const owner = await shot('owner-375.png')
        for (const line of ['Drafted with AI · edit anytime', 'Scoring style']) {
            if (!owner.includes(line)) problems.push(`the owner's Loadout is missing "${line}"`)
        }
        if (!(await page.ariaLabels()).includes(`Rated: ${peekRated}`)) problems.push(`peek's Rated stat is not ${peekRated}`)

        const opened = await page.evaluate(`(() => {
            const link = document.querySelector('[aria-label="Top scores"] [role="link"]')
            if (!link) return ''
            link.click()
            return link.getAttribute('aria-label') || 'unnamed'
        })()`)
        if (!opened) problems.push('Top scores has no game link')
        else {
            await page.waitUntil(`location.pathname.startsWith('/games/') ? 'ok' : location.pathname`, 30_000)
            visits.topScore = await page.evaluate('location.pathname')
            await page.clickControl('Back')
            await waitForPath(`/user/${peekUsername}/loadout`)
        }

        // Save to profile copies the Read-out onto the profile.
        await page.clickControl('Save to profile')
        await page.waitForText('Saved to profile', 30_000)
        postgres.bioAfterSave = peekColumn('profile_loadout_bio')
        if (postgres.bioAfterSave !== SEEDED) problems.push(`Save to profile stored "${postgres.bioAfterSave}"`)

        // Clear asks first, then removes the Read-out and the profile copy.
        await page.clickControl('Clear my Read-out')
        await page.waitForText('Clear your Read-out?')
        await shot('clear-confirm-375.png')
        await page.clickControl('Clear it')
        await page.waitForText("You haven't generated a Read-out yet.", 30_000)
        postgres.identityAfterClear = peekColumn('loadout_identity')
        postgres.bioAfterClear = peekColumn('profile_loadout_bio')
        if (postgres.identityAfterClear || postgres.bioAfterClear) problems.push('Clear left the Read-out or its profile copy in Postgres')
        await shot('cleared-375.png')

        // Generate: a new paragraph with ANTHROPIC_API_KEY, the retry message without it.
        await page.clickControl('Generate your Read-out')
        if (anthropicSet) {
            await page.waitUntil(`document.body.innerText.includes('Regenerate') ? 'ok' : 'waiting'`, 90_000)
            postgres.identityAfterGenerate = peekColumn('loadout_identity')
            if (!postgres.identityAfterGenerate) problems.push('Generate did not save a Read-out')
            await page.clickControl('Regenerate')
            await page.waitForText('Too many requests.', 30_000)
            generate = 'generated, then the one-a-minute limit'
        } else {
            await page.waitForText(UNAVAILABLE, 45_000)
            postgres.identityAfterGenerate = peekColumn('loadout_identity')
            if (postgres.identityAfterGenerate) problems.push('Generate saved a Read-out without ANTHROPIC_API_KEY')
            generate = 'unavailable: ANTHROPIC_API_KEY is unset'
        }
        await shot('generate-375.png')

        await page.setViewport(320, 568)
        await shot('owner-320.png')

        await writeFile(join(dir, 'result.json'), JSON.stringify({ feature: 'mobile-loadout', expo: expoOrigin, anthropicApiKey: anthropicSet ? 'set' : 'unset', generate, shots, postgres, visits, problems }, null, 2))
    } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error))
        try { await page?.screenshot(join(dir, 'failed.png')) } catch { /* the page may already be gone */ }
        try {
            await writeFile(join(dir, 'result.json'), JSON.stringify({ feature: 'mobile-loadout', generate, shots, postgres, visits, problems }, null, 2))
        } catch { /* evidence dir may be missing */ }
        code = 1
    } finally {
        page?.close()
        stopChrome(chromePid)
        stopExpo(expoPid)
        deleteNova()
        try { restorePeek(saved) } catch (error) { log(error instanceof Error ? error.message : String(error)) }
    }
    if (problems.length) console.error(problems.join('\n'))
    if (code !== 0 || problems.length) process.exit(code || 1)
    log(`proved mobile-loadout evidence ${dir}`)
}
