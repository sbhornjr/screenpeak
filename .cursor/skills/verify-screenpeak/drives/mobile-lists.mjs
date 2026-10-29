// drive mobile-lists: the recipe is ../features/mobile-lists.md.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { startExpo, stopExpo } from '../apps.mjs'
import { connectChrome, launchChrome, stopChrome } from '../browser.mjs'
import {
    adaUsername, appPort, databaseUrl, evidenceRoot, expoPort, peekEmail, peekPassword, peekUsername,
} from '../config.mjs'
import { psql } from '../database.mjs'
import { readPublicEnv } from '../env.mjs'
import { deleteAda, insertPrivateAda, peekLibraryGames, sqlLiteral } from '../fixtures.mjs'
import { fail, log, portOpen, requireDoctor, waitForHttp } from '../runtime.mjs'

function insertNamedList(username, name, description, isPublic, gameId) {
    if (gameId && !/^[0-9a-f-]{36}$/i.test(gameId)) throw new Error('list game id was not a uuid')
    const desc = description ? sqlLiteral(description) : 'NULL'
    psql(databaseUrl, `
        INSERT INTO lists (user_id, name, description, is_public, is_default, is_pinned)
        SELECT u.id, ${sqlLiteral(name)}, ${desc}, ${isPublic ? 'true' : 'false'}, false, false
        FROM users u
        WHERE u.username = ${sqlLiteral(username)}
          AND NOT EXISTS (
            SELECT 1 FROM lists existing
            WHERE existing.user_id = u.id AND existing.name = ${sqlLiteral(name)}
          );
    `)
    if (gameId) {
        psql(databaseUrl, `
            INSERT INTO list_games (list_id, game_id, position)
            SELECT l.id, '${gameId}'::uuid, 0
            FROM lists l
            JOIN users u ON u.id = l.user_id
            WHERE u.username = ${sqlLiteral(username)} AND l.name = ${sqlLiteral(name)}
              AND NOT EXISTS (
                SELECT 1 FROM list_games lg
                WHERE lg.list_id = l.id AND lg.game_id = '${gameId}'::uuid
              );
        `)
    }
    const id = psql(databaseUrl, `
        SELECT l.id::text
        FROM lists l
        JOIN users u ON u.id = l.user_id
        WHERE u.username = ${sqlLiteral(username)} AND l.name = ${sqlLiteral(name)}
    `, ['-tA'])
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error(`list id for ${name} was not a uuid`)
    return id
}

function defaultListId(username) {
    const id = psql(databaseUrl, `
        SELECT l.id::text
        FROM lists l
        JOIN users u ON u.id = l.user_id
        WHERE u.username = ${sqlLiteral(username)} AND l.is_default
    `, ['-tA'])
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error(`default list id for ${username} was not a uuid`)
    return id
}

function deleteNamedLists(names) {
    if (!names.length) return
    psql(databaseUrl, `DELETE FROM lists WHERE name IN (${names.map(sqlLiteral).join(', ')});`)
}

function namedListCount(names) {
    return psql(databaseUrl, `
        SELECT count(*)::text FROM lists WHERE name IN (${names.map(sqlLiteral).join(', ')})
    `, ['-tA'])
}

export async function driveMobileLists() {
    requireDoctor()
    if (await portOpen(expoPort)) fail(`Port ${expoPort} is already in use. Not starting Expo.`)
    const publicEnv = readPublicEnv()
    const games = peekLibraryGames()
    const game = games[0]
    if (!game?.id || !game?.name) fail('peek has no library games')
    const dir = join(evidenceRoot, 'mobile-lists')
    await mkdir(dir, { recursive: true })
    const seeded = ['Night runs', 'Secret shelf', "Ada's picks", 'Ada hidden', 'Drive shelf']
    insertPrivateAda()
    const origin = `http://127.0.0.1:${appPort}`
    const expoOrigin = `http://localhost:${expoPort}`
    const problems = []
    const shots = {}
    const marks = {}
    let nightId = ''
    let adaHiddenId = ''
    let wishlistId = ''
    let page = null
    let chromePid = null
    let expoPid = null
    let code = 0
    try {
        nightId = insertNamedList(peekUsername, 'Night runs', 'After midnight.', true, game.id)
        insertNamedList(peekUsername, 'Secret shelf', 'Just for peek.', false, null)
        wishlistId = defaultListId(peekUsername)
        insertNamedList(adaUsername, "Ada's picks", 'Public picks.', true, game.id)
        adaHiddenId = insertNamedList(adaUsername, 'Ada hidden', 'Stay off the index.', false, null)
        expoPid = startExpo(origin, publicEnv)
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

        async function expectCentered(label) {
            const measure = await wordmark()
            marks[label] = measure
            if (!measure) {
                problems.push(`${label} is missing ScreenPeak`)
                return
            }
            if (Math.abs(measure.delta) > 12) problems.push(`${label} wordmark is ${measure.delta}px off center`)
        }

        async function closeSheet() {
            await page.clickControl('Close')
            await page.waitUntil(`(() => {
                const open = [...document.querySelectorAll('[role="dialog"]')].some((item) => item.getClientRects().length > 0)
                return open ? 'waiting' : 'ok'
            })()`)
        }

        async function gameCellWidth() {
            return page.evaluate(`(() => {
                const link = [...document.querySelectorAll('[aria-label]')].find((item) => item.getAttribute('aria-label') === ${JSON.stringify(game.name)} && item.getClientRects().length > 0)
                if (!link) return null
                const cell = link.parentElement || link
                const rect = cell.getBoundingClientRect()
                return { width: Math.round(rect.width * 10) / 10, window: window.innerWidth }
            })()`)
        }

        async function hasControl(name) {
            return page.evaluate(`(() => {
                const nodes = [...document.querySelectorAll('button, [role="button"], a, [role="link"]')]
                return nodes.some((item) => {
                    if (!item.getClientRects().length) return false
                    const label = (item.getAttribute('aria-label') || '').trim()
                    const text = (item.textContent || '').trim()
                    return label === ${JSON.stringify(name)} || text === ${JSON.stringify(name)}
                }) ? 'yes' : 'no'
            })()`)
        }

        async function hasLabel(name) {
            return page.evaluate(`(() => {
                const want = ${JSON.stringify(name)}
                const nodes = [...document.querySelectorAll('[aria-label]')]
                return nodes.some((item) => item.getClientRects().length > 0 && (item.getAttribute('aria-label') || '').trim() === want) ? 'yes' : 'no'
            })()`)
        }

        async function hasLikeAction() {
            return page.evaluate(`(() => {
                const nodes = [...document.querySelectorAll('button, [role="button"]')]
                return nodes.some((item) => {
                    if (!item.getClientRects().length) return false
                    return /^(Like|Unlike) list,/.test((item.getAttribute('aria-label') || '').trim())
                }) ? 'yes' : 'no'
            })()`)
        }

        async function privateMetaHeight() {
            return page.evaluate(`(() => {
                const lock = [...document.querySelectorAll('[aria-label="Private"]')].find((item) => item.getClientRects().length > 0)
                if (!lock || !lock.parentElement) return null
                const rect = lock.parentElement.getBoundingClientRect()
                return { height: Math.round(rect.height * 10) / 10 }
            })()`)
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
        await page.clickTab('Profile')
        await page.waitForText('@peek')
        await page.clickControl('Lists')
        await page.waitForText('Your Lists')
        await page.waitForText('Night runs')
        await page.waitForText('Secret shelf')
        await page.waitForText('Show: My lists')
        await page.waitForText('New list')
        const indexPath = await page.evaluate('location.pathname')
        if (indexPath !== `/user/${peekUsername}/lists`) problems.push(`profile Lists opened ${indexPath}`)
        const ownIndex = await page.bodyText()
        if (await hasLabel('Private') !== 'yes') problems.push('own lists index hides the private list')
        if (!ownIndex.includes('Wishlist')) problems.push('own lists index is missing Wishlist')
        await expectCentered('index-375')
        await shot('index-375.png')
        await page.clickControl('Show: My lists')
        await page.waitForText('Liked lists')
        await page.waitForText('My lists')
        await closeSheet()
        await page.setViewport(320, 568)
        await page.waitForText('Show: My lists')
        await expectCentered('index-320')
        const meta320 = await privateMetaHeight()
        marks['private-meta-320'] = meta320
        if (!meta320) problems.push('private list meta is missing at 320')
        else if (meta320.height > 28) problems.push(`private list meta is ${meta320.height}px tall at 320`)
        await shot('index-320.png')
        const usernameHit = await page.evaluate(`(() => {
            const links = [...document.querySelectorAll('a, [role="link"]')].filter((item) => (item.getAttribute('aria-label') || '').trim() === 'peek' && item.getClientRects().length > 0)
            const link = links[0]
            if (!link) return null
            const rect = link.getBoundingClientRect()
            const onName = document.elementFromPoint(rect.left + Math.min(4, rect.width / 2), rect.top + rect.height / 2)
            const beside = document.elementFromPoint(Math.min(rect.right + 16, window.innerWidth - 2), rect.top + rect.height / 2)
            return {
                nameHit: !!(onName && (onName === link || link.contains(onName))),
                besideHit: !!(beside && (beside === link || link.contains(beside))),
                width: Math.round(rect.width * 10) / 10,
            }
        })()`)
        marks['username-hit-320'] = usernameHit
        if (!usernameHit) problems.push('username link is missing at 320')
        else {
            if (!usernameHit.nameHit) problems.push('username text does not receive the tap')
            if (usernameHit.besideHit) problems.push('username link extends past the text')
            if (usernameHit.width > 96) problems.push(`username link is ${usernameHit.width}px wide`)
        }
        await page.clickLabel('Secret shelf')
        await page.waitForText('Just for peek.')
        if (await hasLikeAction() === 'yes') problems.push('own private list offers Like')
        if (await hasLabel('0 likes') !== 'yes') problems.push('own private list hides the like count')
        await shot('private-320.png')
        await page.clickControl('Back')
        await page.waitForText('Your Lists')

        await page.setViewport(375, 667)
        await page.clickLabel('Night runs')
        await page.waitForText('After midnight.')
        await page.waitForText(game.name)
        await page.waitForText('Add games')
        const ownPath = await page.evaluate('location.pathname')
        if (ownPath !== `/user/${peekUsername}/lists/${nightId}`) problems.push(`Night runs opened ${ownPath}`)
        if (await hasControl('Edit list') !== 'yes') problems.push('own list is missing Edit')
        if (await hasControl(`Remove ${game.name}`) !== 'yes') problems.push('own list is missing Remove')
        if (await hasLikeAction() === 'yes') problems.push('own list offers Like')
        if (await hasLabel('0 likes') !== 'yes') problems.push('own list hides the like count')
        await shot('own-375.png')
        const wideCell = await gameCellWidth()
        marks['cell-375'] = wideCell
        if (!wideCell) problems.push('own list has no game cell at 375')
        else if (Math.abs(wideCell.width - 165.5) > 12) problems.push(`game cell is ${wideCell.width}px wide at 375`)
        await page.setViewport(320, 568)
        await page.waitForText(game.name)
        await shot('own-320.png')
        const narrowCell = await gameCellWidth()
        marks['cell-320'] = narrowCell
        if (!narrowCell) problems.push('own list has no game cell at 320')
        else if (Math.abs(narrowCell.width - 138) > 12) problems.push(`game cell is ${narrowCell.width}px wide at 320`)

        await page.setViewport(375, 667)
        const beforeRemove = await page.evaluate('location.pathname')
        await page.clickLabel(`Remove ${game.name}`)
        await page.waitForText(`Remove ${game.name}?`)
        await page.waitForText('It leaves this list. The game stays in the catalogue.')
        const duringRemove = await page.evaluate('location.pathname')
        if (duringRemove !== beforeRemove) problems.push(`remove overlay navigated to ${duringRemove}`)
        if (!(await page.bodyText()).includes(game.name)) problems.push('remove overlay left the list')
        await page.clickControl('Keep')
        await page.waitUntil(`document.body.innerText.includes(${JSON.stringify(`Remove ${game.name}?`)}) ? 'waiting' : 'ok'`)
        if ((await page.evaluate('location.pathname')) !== beforeRemove) problems.push('closing remove left the list')

        await page.clickLabel('Edit list')
        await page.waitForText('List name')
        await page.waitForText('Description')
        await page.waitForText('Public')
        await page.waitForText('Pinned')
        await page.waitForText('Delete list')
        if ((await page.evaluate('location.pathname')) !== beforeRemove) problems.push('edit sheet left the list')
        await shot('edit-375.png')
        await page.setViewport(320, 568)
        await page.waitForText('List name')
        await shot('edit-320.png')
        await page.setViewport(375, 667)
        await closeSheet()
        await page.waitForText('Night runs')

        await page.clickControl('Back')
        await page.waitForText('Your Lists')
        await page.clickLabel('Wishlist')
        await page.waitForText('This list is empty')
        await page.waitForText('Add a few games to get it started.')
        const emptyPath = await page.evaluate('location.pathname')
        if (emptyPath !== `/user/${peekUsername}/lists/${wishlistId}`) problems.push(`Wishlist opened ${emptyPath}`)
        await shot('empty-375.png')
        await page.setViewport(320, 568)
        await page.waitForText('This list is empty')
        await shot('empty-320.png')
        await page.setViewport(375, 667)
        await page.clickLabel('Edit list')
        await page.waitForText('List name')
        const deleteOnDefault = await page.evaluate(`(() => {
            const dialog = [...document.querySelectorAll('[role="dialog"]')].find((item) => item.getClientRects().length > 0)
            if (!dialog) return 'no-dialog'
            return [...dialog.querySelectorAll('button, [role="button"]')].some((item) => (item.textContent || '').trim() === 'Delete list') ? 'yes' : 'no'
        })()`)
        if (deleteOnDefault !== 'no') problems.push('default Wishlist offers Delete list')
        await closeSheet()
        await page.clickControl('Back')
        await page.waitForText('Your Lists')

        await page.clickControl('New list')
        await page.waitForText('List name')
        await page.waitForText('Create list')
        await page.waitForText('Public')
        await page.waitForText('Pinned')
        await shot('create-375.png')
        await page.setViewport(320, 568)
        await page.waitForText('Create list')
        await shot('create-320.png')
        await page.setViewport(375, 667)
        await page.fillLabel('List name', 'Drive shelf')
        await page.fillLabel('Description', 'Temporary.')
        await page.clickControl('Create list')
        await page.waitForText('Drive shelf', 45_000)
        await page.waitUntil(`(() => {
            const open = [...document.querySelectorAll('[role="dialog"]')].some((item) => item.getClientRects().length > 0)
            return open ? 'waiting' : 'ok'
        })()`)
        const created = namedListCount(['Drive shelf'])
        if (created !== '1') problems.push(`Drive shelf count is ${created}`)
        await page.clickLabel('Drive shelf')
        await page.waitForText('Temporary.')
        await page.clickLabel('Edit list')
        await page.waitForText('Delete list')
        await page.clickControl('Delete list')
        await page.waitForText('Delete this list?')
        await page.waitForText('This cannot be undone.')
        await page.clickControl('Delete list')
        await page.waitForText('Your Lists', 45_000)
        await page.waitUntil(`document.body.innerText.includes('Drive shelf') ? 'waiting' : 'ok'`)
        const afterDelete = namedListCount(['Drive shelf'])
        if (afterDelete !== '0') problems.push(`Drive shelf remained (${afterDelete})`)
        await writeFile(join(dir, 'postgres.txt'), `drive shelf after delete: ${afterDelete}\nwishlist: ${wishlistId}\n`)

        await page.navigate(`${expoOrigin}/user/${adaUsername}`)
        await page.waitForText('@ada')
        await page.clickControl('Lists')
        await page.waitForText("ada's Lists")
        await page.waitForText("Ada's picks")
        await page.waitForText("Show: ada's lists")
        const adaIndex = await page.bodyText()
        if (adaIndex.includes('Ada hidden')) problems.push("ada's index shows the private list")
        if (adaIndex.includes('New list')) problems.push("ada's index shows New list")
        if (adaIndex.includes('Secret shelf')) problems.push("ada's index shows peek's private list")
        await shot('other-index-375.png')
        await page.setViewport(320, 568)
        await page.waitForText("ada's Lists")
        await shot('other-index-320.png')

        await page.setViewport(375, 667)
        await page.clickLabel("Ada's picks")
        await page.waitForText('Public picks.')
        await page.waitForText(game.name)
        if (await hasControl('Edit list') !== 'no') problems.push("someone else's list shows Edit")
        if (await hasControl('Add games') !== 'no') problems.push("someone else's list shows Add games")
        if (await hasControl(`Remove ${game.name}`) !== 'no') problems.push("someone else's list shows Remove")
        if (await hasControl('Like list, 0 likes') !== 'yes') problems.push("someone else's list is missing Like")
        await shot('other-375.png')
        await page.setViewport(320, 568)
        await page.waitForText('Public picks.')
        await shot('other-320.png')
        await page.clickLabel('Like list, 0 likes')
        await page.waitUntil(`(() => {
            const nodes = [...document.querySelectorAll('button, [role="button"]')]
            return nodes.some((item) => item.getClientRects().length > 0 && (item.getAttribute('aria-label') || '').trim() === 'Unlike list, 1 like') ? 'ok' : 'waiting'
        })()`)
        await shot('other-liked-320.png')
        await page.clickControl('Back')
        await page.waitForText("ada's Lists")
        await page.waitUntil(`(() => {
            const nodes = [...document.querySelectorAll('button, [role="button"]')]
            return nodes.some((item) => item.getClientRects().length > 0 && (item.getAttribute('aria-label') || '').trim() === 'Unlike list, 1 like') ? 'ok' : 'waiting'
        })()`)
        await shot('other-index-liked-320.png')

        await page.setViewport(375, 667)
        await page.navigate(`${expoOrigin}/user/${adaUsername}/lists/${adaHiddenId}`)
        await page.waitForText('Not found.')
        await page.waitForText("Couldn't load this screen")
        const hiddenText = await page.bodyText()
        if (hiddenText.includes('Ada hidden')) problems.push('private list url shows the title')
        if (hiddenText.includes('Edit list') || hiddenText.includes('Add games')) problems.push('private list url shows owner actions')

        await writeFile(join(dir, 'result.json'), JSON.stringify({
            feature: 'mobile-lists',
            expo: expoOrigin,
            shots,
            marks,
            gameName: game.name,
            nightId,
            adaHiddenId,
            wishlistId,
            indexPath,
            ownPath,
            emptyPath,
            problems,
        }, null, 2))
    } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error))
        try { await page?.screenshot(join(dir, 'failed.png')) } catch { /* the page may already be gone */ }
        try {
            await writeFile(join(dir, 'result.json'), JSON.stringify({ feature: 'mobile-lists', shots, marks, problems }, null, 2))
        } catch { /* evidence dir may be missing */ }
        code = 1
    } finally {
        page?.close()
        stopChrome(chromePid)
        stopExpo(expoPid)
        try {
            deleteNamedLists(seeded)
            const left = namedListCount(seeded)
            if (left !== '0') {
                log(`seeded lists still present: ${left}`)
                code = 1
            }
            if (wishlistId && defaultListId(peekUsername) !== wishlistId) {
                log('Wishlist id changed')
                code = 1
            }
        } catch (error) {
            log(error instanceof Error ? error.message : String(error))
            code = 1
        }
        deleteAda()
    }
    if (problems.length) console.error(problems.join('\n'))
    if (code !== 0 || problems.length) process.exit(code || 1)
    log(`proved mobile-lists evidence ${dir}`)
}
