// drive mobile-profile: the recipe is ../features/mobile-profile.md.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { startExpo, stopExpo } from '../apps.mjs'
import { connectChrome, launchChrome, stopChrome } from '../browser.mjs'
import {
    adaUsername, appPort, databaseUrl, evidenceRoot, expoPort, novaEmail, novaUsername, peekEmail, peekPassword,
    peekUsername,
} from '../config.mjs'
import { psql } from '../database.mjs'
import { readPublicEnv } from '../env.mjs'
import { deleteAda, deleteNova, insertPrivateAda, peekLibraryGames, sqlLiteral, sqlNullable } from '../fixtures.mjs'
import { fail, log, portOpen, requireDoctor, waitForHttp } from '../runtime.mjs'

function peekColumn(column) {
    return psql(databaseUrl, `select coalesce(${column}, '') from users where username = '${peekUsername}'`, ['-tA'])
}

function peekProfileColumns() {
    return {
        displayName: peekColumn('display_name'),
        userBio: peekColumn('user_bio'),
        selectedTitle: peekColumn('selected_title'),
        quote: peekColumn('profile_loadout_bio'),
        favorites: psql(databaseUrl, `select coalesce(favorite_game_ids::text, '{}') from users where username = '${peekUsername}'`, ['-tA']),
    }
}

function libraryCountLabel(username) {
    return psql(databaseUrl, `
        select count(*)::text || ' games · ' || count(*) filter (where le.status = 'completed')::text || ' completed'
        from library_entries le
        join users u on u.id = le.user_id
        where u.username = '${username}'
    `, ['-tA'])
}

function dressPeekProfile(favoriteId, reviewGameId) {
    psql(databaseUrl, `
        update users set
            display_name = 'Peek Reader',
            user_bio = 'Reads the room before the boss.',
            selected_title = 'Range Finder',
            profile_loadout_bio = 'A patient roguelike reader.',
            favorite_game_ids = ARRAY['${favoriteId}'::uuid]
        where username = '${peekUsername}';
        update ratings_reviews
        set review = 'A sharp climb.'
        where user_id = (select id from users where username = '${peekUsername}')
          and game_id = '${reviewGameId}'::uuid;
    `)
}

function restorePeekProfile(saved, reviewGameId, reviewB64) {
    if (!/^[0-9a-f-]{36}$/i.test(reviewGameId)) throw new Error('peek review game id was not a uuid')
    if (!/^[A-Za-z0-9+/=]*$/.test(reviewB64)) throw new Error('peek review snapshot was not base64')
    if (!/^[{},0-9a-f-]*$/i.test(saved.favorites)) throw new Error('peek favorite ids were not a uuid array')
    psql(databaseUrl, `
        update users set
            display_name = ${sqlNullable(saved.displayName)},
            user_bio = ${sqlNullable(saved.userBio)},
            selected_title = ${sqlNullable(saved.selectedTitle)},
            profile_loadout_bio = ${sqlNullable(saved.quote)},
            favorite_game_ids = '${saved.favorites}'::uuid[]
        where username = '${peekUsername}';
        update ratings_reviews
        set review = convert_from(decode('${reviewB64}', 'base64'), 'UTF8')
        where user_id = (select id from users where username = '${peekUsername}')
          and game_id = '${reviewGameId}'::uuid;
    `)
}

function insertPublicNova(favoriteId, otherId) {
    psql(databaseUrl, `
        INSERT INTO auth.users (id, email, raw_user_meta_data)
        SELECT gen_random_uuid(), '${novaEmail}', '{"username":"${novaUsername}"}'::jsonb
        WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = '${novaEmail}');
        UPDATE public.users
        SET username = '${novaUsername}',
            display_name = 'Nova Vale',
            user_bio = 'Public shelves, public read-out.',
            selected_title = 'Open Shelf',
            profile_loadout_bio = 'A public read-out.',
            library_public = true,
            loadout_public = true,
            favorite_game_ids = ARRAY['${favoriteId}'::uuid]
        WHERE id = (SELECT id FROM auth.users WHERE email = '${novaEmail}');
        INSERT INTO library_entries (user_id, game_id, status, source)
        SELECT u.id, rows.game_id, rows.status, 'manual'
        FROM users u
        JOIN (VALUES ('${favoriteId}'::uuid, 'completed'), ('${otherId}'::uuid, 'playing')) AS rows(game_id, status) ON true
        WHERE u.username = '${novaUsername}'
        ON CONFLICT (user_id, game_id) DO UPDATE SET status = EXCLUDED.status;
        INSERT INTO ratings_reviews (user_id, game_id, rating, review)
        SELECT u.id, '${favoriteId}'::uuid, 8, 'Open shelves.'
        FROM users u WHERE u.username = '${novaUsername}'
        ON CONFLICT (user_id, game_id) DO UPDATE SET rating = EXCLUDED.rating, review = EXCLUDED.review;
    `)
}

function giveAdaPrivateNote(gameId) {
    psql(databaseUrl, `
        UPDATE public.users
        SET display_name = 'Ada Lovelace',
            user_bio = 'Keeps the shelves shut.',
            profile_loadout_bio = 'hidden readout'
        WHERE username = '${adaUsername}';
        INSERT INTO ratings_reviews (user_id, game_id, rating, review)
        SELECT u.id, '${gameId}'::uuid, 7, 'A private note.'
        FROM users u WHERE u.username = '${adaUsername}'
        ON CONFLICT (user_id, game_id) DO UPDATE SET rating = EXCLUDED.rating, review = EXCLUDED.review;
    `)
}

function followRows(follower, following) {
    return psql(databaseUrl, `
        select count(*) from follows f
        join users a on a.id = f.follower_id
        join users b on b.id = f.following_id
        where a.username = '${follower}' and b.username = '${following}'
    `, ['-tA'])
}

export async function driveMobileProfile() {
    requireDoctor()
    if (await portOpen(expoPort)) fail(`Port ${expoPort} is already in use. Not starting Expo.`)
    const games = peekLibraryGames()
    if (games.length < 2 || games.some((game) => !/^[0-9a-f-]{36}$/i.test(game.id))) fail('peek needs two library games before the profile drive.')
    const [reviewGame, favoriteGame] = games
    const longReviewTitle = 'The Extremely Long Chronicle of the Northern Reach'
    const saved = peekProfileColumns()
    const reviewB64 = psql(databaseUrl, `
        select encode(convert_to(coalesce(review, ''), 'UTF8'), 'base64')
        from ratings_reviews
        where user_id = (select id from users where username = '${peekUsername}')
          and game_id = '${reviewGame.id}'::uuid
    `, ['-tA'])
    const publicEnv = readPublicEnv()
    const dir = join(evidenceRoot, 'mobile-profile')
    await mkdir(dir, { recursive: true })
    const origin = `http://127.0.0.1:${appPort}`
    const expoOrigin = `http://localhost:${expoPort}`
    const problems = []
    const shots = {}
    let page = null
    let chromePid = null
    let expoPid = null
    let code = 0
    let peekCounts = ''
    let novaCounts = ''
    let novaId = ''
    try {
        dressPeekProfile(favoriteGame.id, reviewGame.id)
        psql(databaseUrl, `update games set name = ${sqlLiteral(longReviewTitle)} where id = '${reviewGame.id}'::uuid`)
        insertPublicNova(reviewGame.id, favoriteGame.id)
        insertPrivateAda()
        giveAdaPrivateNote(reviewGame.id)
        peekCounts = libraryCountLabel(peekUsername)
        novaCounts = libraryCountLabel(novaUsername)
        novaId = psql(databaseUrl, `select id::text from users where username = '${novaUsername}'`, ['-tA'])
        if (novaCounts !== '2 games · 1 completed') problems.push(`nova library label was ${novaCounts}`)
        if (!/^[0-9a-f-]{36}$/i.test(novaId)) problems.push('nova id was not a uuid')
        expoPid = startExpo(origin, publicEnv)
        await waitForHttp(expoOrigin, 180_000)
        chromePid = await launchChrome()
        page = await connectChrome()

        async function shot(name) {
            const path = join(dir, name)
            await page.screenshot(path)
            shots[name] = path
            const text = await page.bodyText()
            if (!(await page.ariaLabels()).includes('ScreenPeak')) problems.push(`${name} is missing ScreenPeak`)
            return text
        }

        await page.navigate(`${expoOrigin}/sign-in`)
        await page.waitForText('Log in')
        await page.fillPlaceholder('Email', peekEmail)
        await page.fillPlaceholder('Password', peekPassword)
        await page.clickControl('Log in')
        await page.waitUntil(`(() => {
            for (let i = 0; i < localStorage.length; i += 1) {
                const key = localStorage.key(i) || ''
                if (key.includes('auth-token') && localStorage.getItem(key)) return 'ok'
            }
            return 'waiting'
        })()`)

        await page.setViewport(375, 667)
        await page.waitUntil(`location.pathname.includes('sign-in') ? 'waiting' : 'ok'`, 30_000)
        await page.waitUntil(`document.querySelector('[role="tab"]') ? 'ok' : 'waiting'`, 30_000)
        await page.clickTab('Profile')
        await page.waitForText('Peek Reader', 45_000)
        await page.waitForText('A sharp climb.')
        await page.waitForText(favoriteGame.name)
        const ownWide = await shot('own-375.png')
        if (!ownWide.includes('@peek')) problems.push('own profile is missing @peek')
        if (!ownWide.includes('Range Finder')) problems.push('own profile is missing the title')
        if (!ownWide.includes('Reads the room before the boss.')) problems.push('own profile is missing the bio')
        if (!ownWide.includes('A patient roguelike reader.')) problems.push('own profile is missing the read-out')
        if (!ownWide.includes(peekCounts)) problems.push('own profile is missing the library counts')
        if (!ownWide.includes(longReviewTitle)) problems.push('own profile is missing the written review game')
        if (await page.controlInView('Loadout') !== 'yes') problems.push('own profile hides Loadout')
        if (await page.controlInView('Lists') !== 'yes') problems.push('own profile hides Lists')
        if (await page.controlInView('Follow') === 'yes') problems.push('own profile shows Follow')
        const ownLabels = await page.ariaLabels()
        if (!ownLabels.includes('Edit profile')) problems.push('own profile is missing Edit profile')

        await page.setViewport(320, 568)
        await shot('own-320.png')
        const scrolled = await page.evaluate(`(() => {
            const name = ${JSON.stringify(longReviewTitle)}
            const node = [...document.querySelectorAll('[aria-label]')].find((item) => (item.getAttribute('aria-label') || '') === name)
            if (!node) return 'missing'
            node.scrollIntoView({ block: 'center' })
            return 'ok'
        })()`)
        if (scrolled !== 'ok') problems.push('could not scroll the long review title into view')
        await shot('review-title-320.png')
        await page.setViewport(375, 667)

        await page.clickLabel('Edit profile')
        await page.waitForText('Profile editing is not on this screen yet.')
        const settingsText = await page.bodyText()
        if (!settingsText.includes('Username, bio, title, photo, and favorite games land here later.')) problems.push('settings stub is missing its note')
        await page.clickControl('Back')
        await page.waitForText('Peek Reader')

        await page.clickControl('View all reviews')
        await page.waitForText(`${peekUsername}'s Ratings & Reviews`, 30_000)
        const ratingsPath = await page.evaluate('location.pathname')
        if (ratingsPath !== `/user/${peekUsername}/ratings_reviews`) problems.push(`View all reviews opened ${ratingsPath}`)
        const ratingsText = await page.bodyText()
        if (!ratingsText.includes(' total')) problems.push('the ratings page is missing its counts')
        await page.clickControl('Back')
        await page.waitForText(peekCounts)

        await page.clickControl(peekCounts)
        await page.waitForText(longReviewTitle)
        const libraryTab = await page.evaluate(`(() => {
            const tab = document.querySelector('[role="tab"][aria-selected="true"]')
            const panel = document.querySelector('[role="tabpanel"][data-state="active"]')
            const root = panel || document.body
            const controls = [...root.querySelectorAll('button, [role="button"]')].map((item) => item.textContent.trim())
            return {
                path: location.pathname,
                tab: tab ? tab.textContent.trim() : '',
                back: controls.includes('Back'),
                loadout: controls.includes('Loadout'),
                game: (root.innerText || '').includes(${JSON.stringify(longReviewTitle)}),
            }
        })()`)
        if (libraryTab.path !== '/library') problems.push(`own library preview landed on ${libraryTab.path}`)
        if (libraryTab.tab !== 'Library') problems.push(`own library preview selected ${libraryTab.tab || 'no tab'}`)
        if (libraryTab.back) problems.push('own library preview left a Back control over the library')
        if (libraryTab.loadout) problems.push('own library preview left the hub on top of the library')
        if (!libraryTab.game) problems.push('own library preview tab is missing a game')

        await page.setViewport(375, 667)
        await page.navigate(`${expoOrigin}/user/${novaUsername}`)
        await page.waitForText('Nova Vale')
        await page.waitForText('Open shelves.')
        const publicWide = await shot('public-375.png')
        if (!publicWide.includes('@nova')) problems.push('public profile is missing @nova')
        if (!publicWide.includes('Public shelves, public read-out.')) problems.push('public profile is missing the bio')
        if (!publicWide.includes('A public read-out.')) problems.push('public profile is missing the read-out')
        if (!publicWide.includes(novaCounts)) problems.push('public profile is missing the library counts')
        if (await page.controlInView('Follow') !== 'yes') problems.push('public profile hides Follow')
        if (await page.controlInView('Loadout') !== 'yes') problems.push('public profile hides Loadout')
        if (await page.controlInView('Lists') !== 'yes') problems.push('public profile hides Lists')
        if ((await page.ariaLabels()).includes('Edit profile')) problems.push('public profile shows Edit profile')
        await page.setViewport(320, 568)
        await shot('public-320.png')
        await page.setViewport(375, 667)

        const followMark = page.eventMark()
        await page.clickControl('Follow')
        await page.waitUntil(`(() => {
            const button = [...document.querySelectorAll('button, [role="button"]')].find((item) => (item.getAttribute('aria-label') || '') === 'Unfollow nova')
            if (!button) return 'waiting'
            const disabled = button.getAttribute('aria-disabled') === 'true' || button.hasAttribute('disabled')
            if (disabled) return 'waiting'
            return (document.body.innerText || '').includes('1 follower') ? 'ok' : 'waiting'
        })()`, 30_000)
        const followUrl = `/api/v1/user/${novaId}/follow`
        const followWrites = page.requestsSince(followMark).filter((item) => item.url.includes(followUrl))
        if (!followWrites.some((item) => item.method === 'POST')) problems.push(`follow did not POST ${followUrl}`)
        if (page.requestUrlsSince(followMark).some((url) => /\/api\/v1\/user\/nova\/follow/.test(url))) problems.push('follow used the username')
        if (followRows(peekUsername, novaUsername) !== '1') problems.push('follow did not store a row')

        await page.clickControl('Following')
        await page.waitUntil(`(() => {
            const button = [...document.querySelectorAll('button, [role="button"]')].find((item) => (item.getAttribute('aria-label') || '') === 'Follow nova')
            if (!button) return 'waiting'
            const disabled = button.getAttribute('aria-disabled') === 'true' || button.hasAttribute('disabled')
            if (disabled) return 'waiting'
            return (document.body.innerText || '').includes('0 followers') ? 'ok' : 'waiting'
        })()`, 30_000)
        const unfollowWrites = page.requestsSince(followMark).filter((item) => item.url.includes(followUrl) && item.method === 'DELETE')
        if (!unfollowWrites.length) problems.push(`unfollow did not DELETE ${followUrl}`)
        if (followRows(peekUsername, novaUsername) !== '0') problems.push('unfollow left a row')

        await page.clickControl(novaCounts)
        await page.waitForText(longReviewTitle)
        const novaLibrary = await page.evaluate(`(() => {
            const root = document.body
            const controls = [...root.querySelectorAll('button, [role="button"]')].map((item) => item.textContent.trim())
            return { path: location.pathname, back: controls.includes('Back'), game: (root.innerText || '').includes(${JSON.stringify(longReviewTitle)}) }
        })()`)
        if (novaLibrary.path !== `/user/${novaUsername}/library`) problems.push(`nova library preview landed on ${novaLibrary.path}`)
        if (!novaLibrary.back) problems.push('nova library is missing Back')
        if (!novaLibrary.game) problems.push('nova library is missing the game')

        await page.setViewport(375, 667)
        const adaMark = page.eventMark()
        await page.navigate(`${expoOrigin}/user/${adaUsername}`)
        await page.waitForText('Ada Lovelace')
        await page.waitForText('A private note.')
        const privateWide = await shot('private-375.png')
        if (!privateWide.includes('@ada')) problems.push('private profile is missing @ada')
        if (!privateWide.includes('Keeps the shelves shut.')) problems.push('private profile is missing the bio')
        if (privateWide.includes('hidden readout')) problems.push('private profile shows the read-out')
        if (privateWide.includes('completed') || privateWide.includes('games ·')) problems.push('private profile shows a library preview')
        if (await page.controlInView('Loadout') === 'yes') problems.push('private profile shows Loadout')
        if (await page.controlInView('Lists') !== 'yes') problems.push('private profile hides Lists')
        if (await page.controlInView('Follow') !== 'yes') problems.push('private profile hides Follow')
        if ((await page.ariaLabels()).includes('Edit profile')) problems.push('private profile shows Edit profile')
        const adaLeaks = page.requestUrlsSince(adaMark).filter((url) => /\/api\/v1\/user\/ada\/(library|loadout|lists)/.test(url))
        if (adaLeaks.length) problems.push(`private profile fetched ${adaLeaks.join(', ')}`)
        await page.setViewport(320, 568)
        await shot('private-320.png')

        await writeFile(join(dir, 'result.json'), JSON.stringify({
            feature: 'mobile-profile',
            expo: expoOrigin,
            shots,
            peekCounts,
            novaCounts,
            novaId,
            followUrl,
            libraryTab,
            novaLibrary,
            problems,
        }, null, 2))
    } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error))
        try { await page?.screenshot(join(dir, 'failed.png')) } catch { /* the page may already be gone */ }
        try {
            await writeFile(join(dir, 'result.json'), JSON.stringify({ feature: 'mobile-profile', shots, problems }, null, 2))
        } catch { /* evidence dir may be missing */ }
        code = 1
    } finally {
        page?.close()
        stopChrome(chromePid)
        stopExpo(expoPid)
        try {
            psql(databaseUrl, `update games set name = ${sqlLiteral(reviewGame.name)} where id = '${reviewGame.id}'::uuid`)
            restorePeekProfile(saved, reviewGame.id, reviewB64)
        } catch (error) {
            log(error instanceof Error ? error.message : String(error))
            code = 1
        }
        deleteNova()
        deleteAda()
    }
    if (problems.length) console.error(problems.join('\n'))
    if (code !== 0 || problems.length) process.exit(code || 1)
    log(`proved mobile-profile evidence ${dir}`)
}
