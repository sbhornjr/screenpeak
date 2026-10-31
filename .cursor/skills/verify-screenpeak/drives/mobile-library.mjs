// drive mobile-library: the recipe is ../features/mobile-library.md.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { startExpo, stopExpo } from '../apps.mjs'
import { connectChrome, launchChrome, stopChrome } from '../browser.mjs'
import { adaUsername, appPort, evidenceRoot, expoPort, peekEmail, peekPassword } from '../config.mjs'
import { readPublicEnv } from '../env.mjs'
import { deleteAda, insertPrivateAda, peekLibraryGames } from '../fixtures.mjs'
import { fail, log, portOpen, requireDoctor, waitForHttp } from '../runtime.mjs'

export async function driveMobileLibrary() {
    requireDoctor()
    if (await portOpen(expoPort)) fail(`Port ${expoPort} is already in use. Not starting Expo.`)
    const publicEnv = readPublicEnv()
    const games = peekLibraryGames()
    const gameName = games[0]?.name
    if (!gameName) fail('peek has no library games')
    const dir = join(evidenceRoot, 'mobile-library')
    await mkdir(dir, { recursive: true })
    insertPrivateAda()
    const origin = `http://127.0.0.1:${appPort}`
    const expoOrigin = `http://localhost:${expoPort}`
    const expoPid = startExpo(origin, publicEnv)
    const problems = []
    const shots = {}
    const marks = {}
    let page = null
    let chromePid = null
    let code = 0
    try {
        await waitForHttp(expoOrigin, 180_000)
        chromePid = await launchChrome()
        page = await connectChrome()

        async function shot(name) {
            const path = join(dir, name)
            await page.screenshot(path)
            shots[name] = path
        }

        async function wordmark() {
            return page.evaluate(`(() => {
                const nodes = [...document.querySelectorAll('[aria-label="ScreenPeak"]')]
                const visible = nodes.filter((item) => item.getClientRects().length > 0)
                const mark = visible[0]
                if (!mark) return null
                const rect = mark.getBoundingClientRect()
                const mid = rect.left + rect.width / 2
                const center = window.innerWidth / 2
                return { mid, center, delta: Math.round((mid - center) * 10) / 10, width: window.innerWidth }
            })()`)
        }

        async function closeSheet() {
            await page.clickControl('Close')
            await page.waitUntil(`(() => {
                const open = [...document.querySelectorAll('[role="dialog"]')].some((item) => item.getClientRects().length > 0)
                return open ? 'waiting' : 'ok'
            })()`)
        }

        async function fillSearch(value) {
            const outcome = await page.evaluate(`(() => {
                const inputs = [...document.querySelectorAll('input, textarea')]
                const visible = inputs.filter((item) => item.getClientRects().length > 0)
                const pool = visible.length ? visible : inputs
                const field = pool.find((item) => {
                    const label = item.getAttribute('aria-label') || ''
                    const placeholder = item.getAttribute('placeholder') || ''
                    return label === 'Search games' || placeholder === 'Search games'
                })
                if (!field) {
                    const described = pool.map((item) => [item.tagName, item.getAttribute('aria-label') || '', item.getAttribute('placeholder') || ''].join(' ')).join(' | ')
                    return 'missing ' + described
                }
                const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
                const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
                setter.call(field, ${JSON.stringify(value)})
                field.dispatchEvent(new Event('input', { bubbles: true }))
                field.dispatchEvent(new Event('change', { bubbles: true }))
                return field.value === ${JSON.stringify(value)} ? 'ok' : 'value'
            })()`)
            if (outcome !== 'ok') throw new Error(`Could not fill Search games (${outcome})`)
        }

        async function expectCentered(label) {
            const measure = await wordmark()
            marks[label] = measure
            if (!measure) {
                problems.push(`${label} is missing ScreenPeak`)
                return
            }
            if (Math.abs(measure.delta) > 12) problems.push(`${label} wordmark is ${measure.delta}px off center`)
        }

        await page.navigate(`${expoOrigin}/sign-in`)
        await page.waitForText('Log in', 180_000)
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
        await page.clickTab('Library')
        await page.waitForText(gameName)
        const own = await page.panelText()
        if (!/done/i.test(own)) problems.push('own library is missing a completed chip')
        if (!/playing/i.test(own)) problems.push('own library is missing a playing chip')
        if (!own.includes('Status: All')) problems.push('own library is missing the status dropdown')
        if (!own.includes('Sort: Name')) problems.push('own library is missing the sort dropdown')
        if (!own.includes('100% only')) problems.push('own library is missing the 100% toggle')
        const hours = await page.evaluate(`document.querySelector('[aria-label^="Hours played"]') ? 'yes' : 'no'`)
        if (hours !== 'yes') problems.push('own library is missing the hours icon')
        const sortToggle = await page.evaluate(`document.querySelector('[aria-label="Sort ascending — tap for descending"], [aria-label="Sort descending — tap for ascending"]') ? 'yes' : 'no'`)
        if (sortToggle !== 'yes') problems.push('own library is missing the sort direction toggle')
        async function waitInView(label) {
            await page.waitUntil(`(() => {
                const nodes = [...document.querySelectorAll('button, [role="button"], input, textarea')]
                const node = nodes.find((item) => (item.textContent || '').trim() === ${JSON.stringify(label)} || item.getAttribute('aria-label') === ${JSON.stringify(label)})
                if (!node) return 'waiting'
                const rect = node.getBoundingClientRect()
                if (rect.height < 8 || rect.width < 8) return 'waiting'
                if (rect.top < 0 || rect.bottom > window.innerHeight) return 'waiting'
                return 'ok'
            })()`)
        }
        async function openStatusMenu() {
            await page.clickControl('Status: All')
            await waitInView('Completed')
        }
        async function revealEdit() {
            const outcome = await page.evaluate(`(() => {
                const button = document.querySelector('[aria-label^="Edit "]')
                if (!button) return 'missing'
                button.scrollIntoView({ block: 'center' })
                return 'ok'
            })()`)
            if (outcome !== 'ok') problems.push('own library is missing the edit overlay')
        }
        async function openFacetSearch() {
            const outcome = await page.evaluate(`(() => {
                const button = [...document.querySelectorAll('button, [role="button"]')].find((item) => /: \\d+ selected$/.test((item.textContent || '').trim()) && item.getClientRects().length > 0)
                if (!button) return 'missing'
                button.click()
                return 'ok'
            })()`)
            if (outcome !== 'ok') {
                problems.push('filters sheet has no facet picker')
                return
            }
            await page.waitUntil(`(() => {
                const dialog = [...document.querySelectorAll('[role="dialog"]')].find((item) => item.getClientRects().length > 0)
                if (!dialog) return 'waiting'
                const field = [...dialog.querySelectorAll('input')].find((item) => (item.getAttribute('aria-label') || '').startsWith('Search '))
                if (!field) return 'waiting'
                const rect = field.getBoundingClientRect()
                if (rect.height < 8 || rect.top < 0 || rect.bottom > window.innerHeight) return 'waiting'
                return 'ok'
            })()`)
        }
        await shot('header-375.png')
        await openStatusMenu()
        await shot('menu-375.png')
        await closeSheet()
        await revealEdit()
        await shot('overlay-375.png')
        async function lastCardWidth() {
            return page.evaluate(`(() => {
                const names = new Set(${JSON.stringify(games.map((game) => game.name))})
                const panel = document.querySelector('[role="tabpanel"]') || document.body
                const scrollers = [panel, ...panel.querySelectorAll('*')].filter((node) => node.scrollHeight > node.clientHeight + 24)
                const scroller = scrollers.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0]
                if (scroller) scroller.scrollTop = scroller.scrollHeight
                const cards = [...document.querySelectorAll('[aria-label]')].filter((item) => names.has(item.getAttribute('aria-label')) && item.getClientRects().length > 0)
                const card = cards[cards.length - 1]
                if (!card) return null
                const rect = card.getBoundingClientRect()
                return { count: cards.length, width: Math.round(rect.width * 10) / 10, window: window.innerWidth }
            })()`)
        }
        await expectCentered('own-375')
        await shot('own-375.png')
        const wideCards = await lastCardWidth()
        marks['odd-375'] = wideCards
        if (!wideCards) problems.push('library grid has no cards at 375')
        else if (Math.abs(wideCards.width - 165.5) > 12) problems.push(`last card is ${wideCards.width}px wide at 375`)
        await shot('odd-375.png')
        await page.setViewport(320, 568)
        await page.waitForText(gameName)
        await page.evaluate(`(() => {
            const panel = document.querySelector('[role="tabpanel"]') || document.body
            const scrollers = [panel, ...panel.querySelectorAll('*')].filter((node) => node.scrollHeight > node.clientHeight + 24)
            const scroller = scrollers.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0]
            if (scroller) scroller.scrollTop = 0
        })()`)
        await expectCentered('own-320')
        await shot('header-320.png')
        await openStatusMenu()
        await shot('menu-320.png')
        await closeSheet()
        await revealEdit()
        await shot('overlay-320.png')
        await shot('own-320.png')
        const narrowCards = await lastCardWidth()
        marks['odd-320'] = narrowCards
        if (!narrowCards) problems.push('library grid has no cards at 320')
        else if (Math.abs(narrowCards.width - 138) > 12) problems.push(`last card is ${narrowCards.width}px wide at 320`)
        await shot('odd-320.png')

        await page.setViewport(375, 667)
        await page.clickControl('Filters')
        await page.waitForText('Clear filters')
        await openFacetSearch()
        await expectCentered('filters-375')
        await shot('filters-375.png')
        await closeSheet()
        await page.setViewport(320, 568)
        await page.clickControl('Filters')
        await page.waitForText('Clear filters')
        await openFacetSearch()
        await shot('filters-320.png')
        await closeSheet()

        await page.setViewport(375, 667)
        await fillSearch('zzzz-no-such-game')
        await page.clickControl('Search')
        await page.waitForText('No games found')
        if ((await page.panelText()).includes(gameName)) problems.push('empty search still shows a game')
        await shot('empty-375.png')
        await page.setViewport(320, 568)
        await page.waitForText('No games found')
        await shot('empty-320.png')
        await page.setViewport(375, 667)
        await fillSearch('')
        await page.clickControl('Search')
        await page.waitForText(gameName)

        await page.clickControl('Sort: Name')
        await page.waitForText('Date added')
        await page.clickControl('Date added')
        await page.waitUntil(`document.querySelector('[aria-label="Sort descending — tap for ascending"]') ? 'ok' : 'waiting'`)
        await page.waitForText(gameName)
        await shot('sort-375.png')
        await page.setViewport(320, 568)
        await page.waitForText(gameName)
        await shot('sort-320.png')
        await page.setViewport(375, 667)

        await page.clickLabel(gameName)
        await page.waitForText('Add to list')
        const gamePath = await page.evaluate('location.pathname')
        if (!String(gamePath).startsWith('/games/')) problems.push(`library card opened ${gamePath}`)
        await page.clickControl('Back')
        await page.waitForText(gameName)

        const beforeEdit = await page.evaluate('location.pathname')
        await page.clickLabel(`Edit ${gameName}`)
        await page.waitForText('Manage game')
        await page.waitForText('Update library entry')
        const editPath = await page.evaluate('location.pathname')
        if (editPath !== beforeEdit) problems.push(`edit overlay navigated to ${editPath}`)
        await page.clickControl('Close')
        await page.waitUntil(`document.body.innerText.includes('Manage game') ? 'waiting' : 'ok'`)

        await page.setViewport(375, 667)
        const privateMark = page.eventMark()
        await page.navigate(`${expoOrigin}/user/${adaUsername}/library`)
        await page.waitForText('This library is private.')
        const privateText = await page.bodyText()
        if (privateText.includes('Not found.')) problems.push('private library says Not found')
        if (games.some((game) => privateText.includes(game.name))) problems.push('private library shows a game')
        const privateFetches = page.requestUrlsSince(privateMark).filter((url) => url.includes(`/api/v1/user/${adaUsername}/library`))
        if (privateFetches.length) problems.push(`private library fetched ${privateFetches.join(', ')}`)
        await expectCentered('private-375')
        await shot('private-375.png')
        await page.setViewport(320, 568)
        await page.waitForText('This library is private.')
        await expectCentered('private-320')
        await shot('private-320.png')

        await page.setViewport(375, 667)
        await page.navigate(expoOrigin)
        await page.waitForTextEither(['Your feed is quiet', gameName, "Couldn't load this screen"], 45_000)
        await expectCentered('logo-375')
        await shot('logo-375.png')
        await page.setViewport(320, 568)
        await expectCentered('logo-320')
        await shot('logo-320.png')

        await writeFile(join(dir, 'result.json'), JSON.stringify({
            feature: 'mobile-library',
            expo: expoOrigin,
            shots,
            marks,
            gameName,
            gamePath,
            privateFetches,
            problems,
        }, null, 2))
    } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error))
        try { await page?.screenshot(join(dir, 'failed.png')) } catch { /* the page may already be gone */ }
        try {
            await writeFile(join(dir, 'result.json'), JSON.stringify({ feature: 'mobile-library', shots, marks, problems }, null, 2))
        } catch { /* evidence dir may be missing */ }
        code = 1
    } finally {
        page?.close()
        stopChrome(chromePid)
        stopExpo(expoPid)
        deleteAda()
    }
    if (problems.length) console.error(problems.join('\n'))
    if (code !== 0 || problems.length) process.exit(code || 1)
    log(`proved mobile-library evidence ${dir}`)
}
