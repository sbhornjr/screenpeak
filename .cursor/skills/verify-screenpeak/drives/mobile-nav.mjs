// drive mobile-nav: the recipe is ../features/mobile-nav.md.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { startExpo, stopExpo } from '../apps.mjs'
import { connectChrome, launchChrome, stopChrome } from '../browser.mjs'
import { adaUsername, appPort, evidenceRoot, expoPort, peekEmail, peekPassword, peekUsername } from '../config.mjs'
import { readLibrary } from '../database.mjs'
import { readPublicEnv } from '../env.mjs'
import { deleteAda, insertPrivateAda } from '../fixtures.mjs'
import { fail, log, portOpen, requireDoctor, waitForHttp } from '../runtime.mjs'

export async function driveMobileNav() {
    requireDoctor()
    if (await portOpen(expoPort)) fail(`Port ${expoPort} is already in use. Not starting Expo.`)
    const publicEnv = readPublicEnv()
    const library = readLibrary()
    const dir = join(evidenceRoot, 'mobile-nav')
    await mkdir(dir, { recursive: true })
    insertPrivateAda()
    const origin = `http://127.0.0.1:${appPort}`
    const expoOrigin = `http://localhost:${expoPort}`
    const expoPid = startExpo(origin, publicEnv)
    const problems = []
    const shots = {}
    let page = null
    let chromePid = null
    let code = 0
    try {
        await waitForHttp(expoOrigin, 180_000)
        chromePid = await launchChrome()
        page = await connectChrome()
        const counts = '5 games · 3 completed'

        async function shot(name, needle, timeoutMs = 30_000) {
            await page.waitForText(needle, timeoutMs)
            const path = join(dir, name)
            await page.screenshot(path)
            shots[name] = path
            return page.panelText()
        }

        await page.navigate(expoOrigin)
        const feedOut = await shot('feed-signed-out.png', 'Sign up, log in, or browse the catalogue.', 180_000)
        if (!feedOut.includes('Welcome')) problems.push('signed-out feed is missing Welcome')
        if (await page.controlInView('Loadout') === 'yes') problems.push('signed-out feed shows Loadout')

        await page.clickControl('Browse')
        await page.waitForText('Games')
        await page.clickControl('Back')
        await page.waitForText('Sign up, log in, or browse the catalogue.')
        const afterBrowse = await page.panelText()
        if (!afterBrowse.includes('Welcome')) problems.push('Back from the catalogue did not return to the welcome')

        await page.clickTab('Explore')
        const exploreOut = await shot('explore-signed-out.png', 'Sign up to see what people you follow are playing.')
        if (!exploreOut.includes('Browse all')) problems.push('signed-out explore is missing Browse all')
        const searchField = await page.evaluate(`document.querySelector('input[aria-label="Search games"]') ? 'yes' : 'no'`)
        if (searchField !== 'yes') problems.push('signed-out explore is missing the search field')

        await page.clickTab('Library')
        const libraryOut = await shot('library-signed-out.png', 'Sign up to see your library.')
        if (library.games.some((name) => libraryOut.includes(name))) problems.push('signed-out library shows a game')

        await page.clickTab('Profile')
        const ownOut = await shot('own-profile-signed-out.png', 'Sign up to see your loadout and lists.')
        if (await page.controlInView('Loadout') === 'yes') problems.push('signed-out profile shows Loadout')
        if (await page.controlInView('Lists') === 'yes') problems.push('signed-out profile shows Lists')
        if (ownOut.includes('completed')) problems.push('signed-out profile shows a library preview')

        await page.navigate(`${expoOrigin}/user/${peekUsername}`)
        const publicOut = await shot('user-peek-signed-out.png', counts)
        if (await page.controlInView('Loadout') !== 'yes') problems.push('public peek profile hides Loadout')
        if (await page.controlInView('Lists') !== 'yes') problems.push('public peek profile hides Lists')
        if (!publicOut.includes(peekUsername)) problems.push('public peek profile is missing the username')

        const adaMark = page.eventMark()
        await page.navigate(`${expoOrigin}/user/${adaUsername}`)
        const adaOut = await shot('user-ada-signed-out.png', adaUsername)
        if (!adaOut.includes('Lists')) problems.push('private ada profile hides Lists')
        if (await page.controlInView('Loadout') === 'yes') problems.push('private ada profile shows Loadout')
        if (adaOut.includes('completed') || adaOut.includes('games ·')) problems.push('private ada profile shows a library preview')
        const adaLeaks = page.requestUrlsSince(adaMark).filter((url) => /\/api\/v1\/user\/ada\/(library|loadout|lists)/.test(url))
        if (adaLeaks.length) problems.push(`private ada hub fetched ${adaLeaks.join(', ')}`)

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
        await page.navigate(expoOrigin)
        const feedNeedles = ['Nothing in your feed yet.', ...library.games, "Couldn't load this screen"]
        await page.waitForTextEither(feedNeedles, 45_000)
        const feedInPath = join(dir, 'feed-signed-in.png')
        await page.screenshot(feedInPath)
        shots['feed-signed-in.png'] = feedInPath
        const feedIn = await page.panelText()
        if (feedIn.includes('Sign up, log in, or browse the catalogue.')) problems.push('signed-in feed still shows the welcome')
        if (feedIn.includes("Couldn't load this screen")) problems.push('signed-in feed failed to load')
        const feedOk = feedIn.includes('Nothing in your feed yet.') || library.games.some((name) => feedIn.includes(name))
        if (!feedOk) problems.push('signed-in feed has neither the empty state nor a library game')

        await page.clickTab('Explore')
        const exploreIn = await shot('explore-signed-in.png', 'Browse all')
        if (exploreIn.includes('Sign up to see what people you follow are playing.')) problems.push('signed-in explore still asks to sign up')

        await page.clickTab('Library')
        const libraryIn = await shot('library-signed-in.png', library.games[0])
        if (libraryIn.includes('Sign up to see your library.')) problems.push('signed-in library still asks to sign up')

        const gameName = library.games[0]
        const opened = await page.evaluate(`(() => {
            const name = ${JSON.stringify(gameName)}
            const nodes = [...document.querySelectorAll('a, [role="link"]')]
            const visible = nodes.filter((item) => item.getClientRects().length > 0)
            const pool = visible.length ? visible : nodes
            const node = pool.find((item) => (item.getAttribute('aria-label') || '').trim() === name)
            if (!node) return 'missing'
            node.click()
            return 'clicked'
        })()`)
        if (opened !== 'clicked') problems.push(`could not open ${gameName} from the library`)
        await page.waitForText('Add to list')
        const rateText = await page.evaluate(`(() => {
            const button = [...document.querySelectorAll('button')].find((item) => item.getAttribute('aria-label') === 'Rate' && item.getClientRects().length > 0)
            return button ? button.textContent.trim() : ''
        })()`)
        if (!rateText) problems.push('game screen is missing Rate')
        else await page.clickControl(rateText)
        await shot('game-rate-sheet.png', 'Review note')
        const rateSheet = await page.evaluate(`(() => {
            const dialog = [...document.querySelectorAll('[role="dialog"]')].find((item) => (item.innerText || '').includes('Review note'))
            return dialog ? dialog.innerText : ''
        })()`)
        if (!rateSheet.includes('Close')) problems.push('rate sheet is missing Close')
        if (!rateSheet.includes('10')) problems.push('rate sheet is missing the score list')
        await page.clickControl('Close')
        await page.waitUntil(`document.body.innerText.includes('Review note') ? 'waiting' : 'ok'`)

        await page.clickControl('Add to list')
        await shot('game-list-sheet.png', 'New list')
        const listStep = await page.bodyText()
        if (listStep.includes('New list name')) problems.push('create fields showed before New list')
        await page.clickControl('New list')
        await page.waitForText('New list name')
        const listFocused = await page.evaluate(`(() => {
            const dialog = [...document.querySelectorAll('[role="dialog"]')].find((item) => (item.innerText || '').includes('New list name'))
            const input = dialog ? dialog.querySelector('input[placeholder="New list name"]') : null
            if (!input) return 'missing'
            input.focus()
            return document.activeElement === input ? (input.getAttribute('placeholder') || '') : 'unfocused'
        })()`)
        if (listFocused !== 'New list name') problems.push(`new list field was not focused (${listFocused})`)
        const listFocusedPath = join(dir, 'game-list-focused.png')
        await page.screenshot(listFocusedPath)
        shots['game-list-focused.png'] = listFocusedPath
        await page.clickControl('Close')
        await page.clickControl('Back')
        await page.waitForText(gameName)

        await page.clickTab('Profile')
        const ownIn = await shot('own-profile-as-peek.png', counts)
        if (await page.controlInView('Loadout') !== 'yes') problems.push('own profile hides Loadout')
        if (await page.controlInView('Lists') !== 'yes') problems.push('own profile hides Lists')
        if (!ownIn.includes(peekUsername)) problems.push('own profile is missing peek')

        async function assertLibraryTab(label) {
            await page.waitForText(library.games[0])
            const state = await page.evaluate(`(() => {
                const tab = document.querySelector('[role="tab"][aria-selected="true"]')
                const panel = document.querySelector('[role="tabpanel"][data-state="active"]')
                const root = panel || document.body
                const controls = [...root.querySelectorAll('button, [role="button"]')].map((item) => item.textContent.trim())
                return {
                    path: location.pathname,
                    tab: tab ? tab.textContent.trim() : '',
                    back: controls.includes('Back'),
                    loadout: controls.includes('Loadout'),
                    game: (root.innerText || '').includes(${JSON.stringify(library.games[0])}),
                }
            })()`)
            if (!String(state.path || '').endsWith('/library')) problems.push(`${label} landed on ${state.path}`)
            if (state.tab !== 'Library') problems.push(`${label} selected tab was ${state.tab || 'missing'}`)
            if (state.back) problems.push(`${label} left a Back control over the library`)
            if (state.loadout) problems.push(`${label} left the hub on top of the library`)
            if (!state.game) problems.push(`${label} library tab is missing a game`)
            return state
        }

        await page.clickControl(counts)
        const fromProfile = await assertLibraryTab('profile library preview')
        const fromProfilePath = join(dir, 'library-from-profile.png')
        await page.screenshot(fromProfilePath)
        shots['library-from-profile.png'] = fromProfilePath

        await page.navigate(`${expoOrigin}/user/${peekUsername}`)
        await page.waitForText(counts)
        await page.clickControl(counts)
        const fromPeek = await assertLibraryTab('peek profile library preview')
        const fromPeekPath = join(dir, 'library-from-peek.png')
        await page.screenshot(fromPeekPath)
        shots['library-from-peek.png'] = fromPeekPath

        const adaInMark = page.eventMark()
        await page.navigate(`${expoOrigin}/user/${adaUsername}`)
        const adaIn = await shot('user-ada-as-peek.png', adaUsername)
        if (!adaIn.includes('Lists')) problems.push('ada as peek hides Lists')
        if (await page.controlInView('Loadout') === 'yes') problems.push('ada as peek shows Loadout')
        if (adaIn.includes('completed') || adaIn.includes('games ·')) problems.push('ada as peek shows a library preview')
        const adaInLeaks = page.requestUrlsSince(adaInMark).filter((url) => /\/api\/v1\/user\/ada\/(library|loadout|lists)/.test(url))
        if (adaInLeaks.length) problems.push(`ada as peek fetched ${adaInLeaks.join(', ')}`)

        async function hiddenRoute(path, shotName, needle, title) {
            const mark = page.eventMark()
            await page.navigate(`${expoOrigin}${path}`)
            await page.waitForText(needle)
            const text = await page.bodyText()
            const leaked = library.games.filter((name) => text.includes(name))
            if (!text.includes(title)) problems.push(`${path} is missing ${title}`)
            if (leaked.length) problems.push(`${path} showed ${leaked.join(', ')}`)
            const libraryFetches = page.requestUrlsSince(mark).filter((url) => url.includes(`/api/v1/user/${adaUsername}/library`))
            const file = join(dir, shotName)
            await page.screenshot(file)
            shots[shotName] = file
            return { leaked, libraryFetches }
        }
        const adaLibraryScreen = await hiddenRoute(`/user/${adaUsername}/library`, 'user-ada-library.png', 'This library is private.', 'This library is private.')
        if (adaLibraryScreen.libraryFetches.length) problems.push(`ada library fetched ${adaLibraryScreen.libraryFetches.join(', ')}`)
        const adaLoadoutScreen = await hiddenRoute(`/user/${adaUsername}/loadout`, 'user-ada-loadout.png', 'Not found.', "Couldn't load this screen")

        const token = await page.evaluate(`(() => {
            for (let i = 0; i < localStorage.length; i += 1) {
                const key = localStorage.key(i) || ''
                if (!key.includes('auth-token')) continue
                try {
                    const data = JSON.parse(localStorage.getItem(key) || '{}')
                    return data.access_token || ''
                } catch { return '' }
            }
            return ''
        })()`)
        const peekPublic = await fetch(`${origin}/api/v1/user/${peekUsername}`).then(async (response) => ({ status: response.status, body: await response.json() }))
        const adaPublic = await fetch(`${origin}/api/v1/user/${adaUsername}`).then(async (response) => ({ status: response.status, body: await response.json() }))
        const adaLibrary = await fetch(`${origin}/api/v1/user/${adaUsername}/library`)
        const adaLoadout = await fetch(`${origin}/api/v1/user/${adaUsername}/loadout`)
        const adaAsPeek = token
            ? await fetch(`${origin}/api/v1/user/${adaUsername}`, { headers: { Authorization: `Bearer ${token}` } }).then(async (response) => ({ status: response.status, body: await response.json() }))
            : { status: 0, body: null }
        const peekAsPeek = token
            ? await fetch(`${origin}/api/v1/user/${peekUsername}`, { headers: { Authorization: `Bearer ${token}` } }).then(async (response) => ({ status: response.status, body: await response.json() }))
            : { status: 0, body: null }
        if (!token) problems.push('sign-in did not store an access token')
        if (peekPublic.body?.library_stats?.total_games !== 5) problems.push('signed-out peek library_stats missing')
        if (peekPublic.body?.profile?.loadout_public !== true) problems.push('peek loadout_public is not true')
        if (adaPublic.body?.library_stats !== null) problems.push('signed-out ada library_stats was not null')
        if (adaPublic.body?.profile?.library_public !== false || adaPublic.body?.profile?.loadout_public !== false) problems.push('ada privacy flags were not false')
        if (adaLibrary.status !== 404 || adaLoadout.status !== 404) problems.push(`ada library ${adaLibrary.status} loadout ${adaLoadout.status}`)
        if (adaAsPeek.body?.viewer?.is_owner !== false) problems.push('ada viewer is_owner was not false')
        if (adaAsPeek.body?.library_stats !== null) problems.push('ada as peek still received library_stats')
        if (peekAsPeek.body?.viewer?.is_owner !== true) problems.push('peek viewer is_owner was not true')
        await writeFile(join(dir, 'result.json'), JSON.stringify({
            feature: 'mobile-nav',
            expo: expoOrigin,
            shots,
            peekSignedOut: { status: peekPublic.status, library_stats: peekPublic.body?.library_stats ?? null, loadout_public: peekPublic.body?.profile?.loadout_public ?? null },
            adaSignedOut: { status: adaPublic.status, library_stats: adaPublic.body?.library_stats ?? null, library_public: adaPublic.body?.profile?.library_public ?? null, loadout_public: adaPublic.body?.profile?.loadout_public ?? null },
            adaLibraryStatus: adaLibrary.status,
            adaLoadoutStatus: adaLoadout.status,
            adaAsPeek: { status: adaAsPeek.status, is_owner: adaAsPeek.body?.viewer?.is_owner ?? null, library_stats: adaAsPeek.body?.library_stats ?? null },
            peekAsPeek: { status: peekAsPeek.status, is_owner: peekAsPeek.body?.viewer?.is_owner ?? null },
            libraryFromProfile: fromProfile,
            libraryFromPeek: fromPeek,
            adaLibraryScreen,
            adaLoadoutScreen,
            problems,
        }, null, 2))
    } catch (error) {
        try { await page?.screenshot(join(dir, 'failed.png')) } catch { /* the page may already be gone */ }
        console.error(error instanceof Error ? error.message : String(error))
        code = 1
    } finally {
        page?.close()
        stopChrome(chromePid)
        stopExpo(expoPid)
        deleteAda()
    }
    if (code !== 0) process.exit(code)
    if (problems.length) {
        console.error(problems.join('\n'))
        process.exit(1)
    }
    log(`proved mobile-nav evidence ${dir}`)
}
