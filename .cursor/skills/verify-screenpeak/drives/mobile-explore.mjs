// drive mobile-explore: the recipe is ../features/mobile-explore.md.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { startExpo, stopExpo } from '../apps.mjs'
import { connectChrome, launchChrome, stopChrome } from '../browser.mjs'
import { adaUsername, appPort, databaseUrl, evidenceRoot, expoPort, novaEmail, novaUsername, peekEmail, peekPassword, peekUsername } from '../config.mjs'
import { psql } from '../database.mjs'
import { readPublicEnv } from '../env.mjs'
import { deleteAda, deleteNova, insertPrivateAda } from '../fixtures.mjs'
import { fail, log, portOpen, requireDoctor, waitForHttp } from '../runtime.mjs'

// 30 games from one developer: more than one catalogue page (24) inside one filter,
// whatever the IGDB seed left in the catalogue. igdb_id stays clear of real ids.
const DEVELOPER = { name: 'Verify Works', slug: 'verify-works', igdbId: 990_000_001 }
const FILLER = Array.from({ length: 30 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0')
    return { name: `Verify Catalogue ${n}`, slug: `verify-catalogue-${n}`, igdbId: 990_000_100 + i }
})
const TRENDING = FILLER[0]
const ADA_SHELF = 'Ada shelf'
const PEEK_SHELF = 'Peek shelf'

function insertFixture() {
    psql(databaseUrl, `
        INSERT INTO developers (igdb_id, name, slug) VALUES (${DEVELOPER.igdbId}, '${DEVELOPER.name}', '${DEVELOPER.slug}');
        INSERT INTO games (igdb_id, name, slug, released)
        VALUES ${FILLER.map((game) => `(${game.igdbId}, '${game.name}', '${game.slug}', '2024-01-01')`).join(', ')};
        INSERT INTO game_developers (game_id, developer_id)
        SELECT g.id, d.id FROM games g, developers d WHERE g.slug LIKE 'verify-catalogue-%' AND d.slug = '${DEVELOPER.slug}';

        INSERT INTO auth.users (id, email, raw_user_meta_data)
        SELECT gen_random_uuid(), '${novaEmail}', '{"username":"${novaUsername}"}'::jsonb
        WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = '${novaEmail}');
        UPDATE public.users SET library_public = true WHERE username = '${novaUsername}';
        INSERT INTO follows (follower_id, following_id)
        SELECT a.id, b.id FROM users a, users b WHERE a.username = '${peekUsername}' AND b.username = '${novaUsername}';
        INSERT INTO follows (follower_id, following_id)
        SELECT a.id, b.id FROM users a, users b WHERE a.username = '${novaUsername}' AND b.username = '${adaUsername}';
        INSERT INTO library_entries (user_id, game_id, status, source)
        SELECT u.id, g.id, 'completed', 'manual' FROM users u, games g WHERE u.username = '${novaUsername}' AND g.slug = '${TRENDING.slug}';
        INSERT INTO ratings_reviews (user_id, game_id, rating)
        SELECT u.id, g.id, 8 FROM users u, games g WHERE u.username = '${novaUsername}' AND g.slug = '${TRENDING.slug}';

        INSERT INTO lists (user_id, name, description, is_public, is_default, is_pinned)
        SELECT u.id, '${ADA_SHELF}', 'Liked by nova.', true, false, false FROM users u WHERE u.username = '${adaUsername}';
        INSERT INTO lists (user_id, name, description, is_public, is_default, is_pinned)
        SELECT u.id, '${PEEK_SHELF}', 'Your own list.', true, false, false FROM users u WHERE u.username = '${peekUsername}';
        INSERT INTO list_likes (user_id, list_id)
        SELECT u.id, l.id FROM users u, lists l WHERE u.username = '${novaUsername}' AND l.name IN ('${ADA_SHELF}', '${PEEK_SHELF}');
    `)
}

function deleteFixture() {
    deleteNova()
    deleteAda()
    try {
        psql(databaseUrl, `
            DELETE FROM lists WHERE name = '${PEEK_SHELF}' AND user_id = (SELECT id FROM users WHERE username = '${peekUsername}');
            DELETE FROM games WHERE slug LIKE 'verify-catalogue-%';
            DELETE FROM developers WHERE slug = '${DEVELOPER.slug}';
        `)
    } catch (error) {
        log(error instanceof Error ? error.message : String(error))
    }
}

// Scroll every scrollable element to its end so a list's onEndReached fires.
const SCROLL_TO_END = `(() => {
    for (const node of document.querySelectorAll('div')) {
        const style = getComputedStyle(node)
        if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) node.scrollTop = node.scrollHeight
    }
})()`

function countLabels(label) {
    return `[...document.querySelectorAll('[aria-label]')].filter((node) => node.getAttribute('aria-label') === ${JSON.stringify(label)} && node.getClientRects().length > 0).length`
}

export async function driveMobileExplore() {
    requireDoctor()
    if (await portOpen(expoPort)) fail(`Port ${expoPort} is already in use. Not starting Expo.`)
    const publicEnv = readPublicEnv()
    const dir = join(evidenceRoot, 'mobile-explore')
    await mkdir(dir, { recursive: true })
    const origin = `http://127.0.0.1:${appPort}`
    const expoOrigin = `http://localhost:${expoPort}`
    const problems = []
    const shots = {}
    const requests = {}
    let page = null
    let chromePid = null
    let expoPid = null
    let code = 0
    try {
        deleteFixture()
        insertPrivateAda()
        insertFixture()
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
        async function waitForLabel(label, timeoutMs = 30_000) {
            await page.waitUntil(`${countLabels(label)} > 0 ? 'ok' : 'waiting'`, timeoutMs)
        }
        function urls(mark, needle) {
            return page.requestUrlsSince(mark).filter((url) => url.includes(needle))
        }
        // The requests are recorded in this process, so poll them here, not in the page.
        async function waitForRequest(mark, test, what, timeoutMs = 30_000) {
            const deadline = Date.now() + timeoutMs
            while (Date.now() < deadline) {
                if (page.requestUrlsSince(mark).some(test)) return
                await new Promise((resolve) => setTimeout(resolve, 250))
            }
            throw new Error(`No request for ${what}`)
        }

        await page.navigate(`${expoOrigin}/sign-in`)
        await page.waitForText('Log in')
        await page.fillPlaceholder('Email', peekEmail)
        await page.fillPlaceholder('Password', peekPassword)
        await page.clickControl('Log in')
        await page.waitUntil(`location.pathname.includes('sign-in') ? 'waiting' : 'ok'`, 30_000)
        await page.waitUntil(`document.querySelector('[role="tab"]') ? 'ok' : 'waiting'`, 30_000)
        await page.setViewport(375, 667)

        // Explore: trending, recommendations, list likes.
        await page.clickTab('Explore')
        await page.waitForText('1 follower completed · 8/10 avg', 45_000)
        const explore = await shot('explore-375.png')
        for (const line of ['Peak right now', TRENDING.name, 'Recommended for you', '1 user you follow liked this', 'Followed by 1 user you follow', 'Lists peaking now', ADA_SHELF, PEEK_SHELF]) {
            if (!explore.includes(line)) problems.push(`explore is missing "${line}"`)
        }
        if (explore.includes('Sign up to see what people you follow are playing.')) problems.push('signed-in explore asks to sign up')
        const likeButtons = await page.evaluate(countLabels('Like list, 1 like'))
        if (likeButtons !== 2) problems.push(`expected Ada shelf's trending and recommended cards to offer Like, found ${likeButtons}`)
        if (await page.evaluate(countLabels('1 like')) < 1) problems.push(`${PEEK_SHELF} does not show its like count`)

        const likeMark = page.eventMark()
        await page.clickLabel('Like list, 1 like')
        await waitForLabel('Unlike list, 2 likes')
        requests.like = page.requestsSince(likeMark).filter((item) => item.method === 'POST' && item.url.includes('/like')).map((item) => item.url)
        if (requests.like.length !== 1) problems.push(`liking sent ${requests.like.length} like requests`)
        if (await page.evaluate(countLabels('Unlike list, 2 likes')) !== 2) problems.push('liking one card did not update the other card for the same list')
        if (await page.evaluate(countLabels('Like list, 1 like')) !== 0) problems.push(`${PEEK_SHELF} offers a Like button`)
        const stored = psql(databaseUrl, `
            select count(*) from list_likes ll join lists l on l.id = ll.list_id join users u on u.id = ll.user_id
            where l.name = '${ADA_SHELF}' and u.username = '${peekUsername}'
        `, ['-tA'])
        if (stored !== '1') problems.push(`peek's like is not stored (${stored})`)
        await shot('explore-liked-375.png')

        const rangeMark = page.eventMark()
        await page.clickControl('All time')
        await waitForRequest(rangeMark, (url) => url.includes('/api/v1/explore') && url.includes('range=alltime'), 'range=alltime')
        await page.waitUntil(`document.querySelector('[aria-label="All time"][aria-selected="true"]') ? 'ok' : 'waiting'`, 30_000)
        requests.range = urls(rangeMark, '/api/v1/explore')

        // Search, then every match in the catalogue.
        await page.fillPlaceholder('Search games', TRENDING.name)
        await page.clickControl('Search')
        await waitForLabel(`${TRENDING.name}, 2024`)
        await shot('explore-search-375.png')
        await page.clickLabel(`Browse all games matching "${TRENDING.name}"`)
        await waitForPath('/games')
        await page.waitForText(`Search: ${TRENDING.name}`, 30_000)
        const searched = await shot('catalogue-search-375.png')
        if (!searched.includes('1 game')) problems.push('the catalogue search does not count one game')
        await page.clickControl('Back')
        await waitForPath('/explore')

        // Before any search, Browse all under the search bar opens the whole catalogue.
        await page.navigate(`${expoOrigin}/explore`)
        await page.waitForText('Peak right now', 45_000)
        await page.clickLabel('Browse all')
        await waitForPath('/games')
        await page.waitUntil(`document.body.innerText.includes('Search: ') ? 'search chip' : 'ok'`, 30_000)
        await page.clickControl('Back')
        await waitForPath('/explore')

        // The genre dropdown opens a sheet; its first genre opens the catalogue with that chip.
        await page.clickLabel('Browse by genre')
        await page.waitUntil(`document.querySelector('[role="dialog"] [aria-label^="Browse "]') ? 'ok' : 'waiting'`, 30_000)
        await shot('browse-genre-375.png')
        const genre = await page.evaluate(`(() => {
            const node = document.querySelector('[role="dialog"] [aria-label^="Browse "]')
            if (!node) return ''
            node.click()
            return node.getAttribute('aria-label').slice('Browse '.length)
        })()`)
        if (!genre) problems.push('explore has no genre to browse')
        else {
            await waitForPath('/games')
            await page.waitForText(`Genre: ${genre}`, 30_000)
            await shot('catalogue-genre-375.png')
            await page.clickControl('Back')
            await waitForPath('/explore')
        }
        await page.setViewport(320, 568)
        await shot('explore-320.png')
        await page.setViewport(375, 667)

        // Catalogue: a developer link names the developer, pages to the end, and sorts.
        const pageMark = page.eventMark()
        await page.navigate(`${expoOrigin}/games?developer=${DEVELOPER.slug}`)
        await page.waitForText(`Developer: ${DEVELOPER.name}`, 45_000)
        const developerFirst = await shot('catalogue-developer-375.png')
        if (!developerFirst.includes('30 games')) problems.push('the developer filter does not count 30 games')
        await page.waitUntil(`(() => {
            ${SCROLL_TO_END}
            const text = document.body.innerText || ''
            return ${JSON.stringify(FILLER.map((game) => game.name))}.every((name) => text.includes(name)) ? 'ok' : 'waiting'
        })()`, 45_000)
        requests.pages = urls(pageMark, '/api/v1/games?')
        if (!requests.pages.some((url) => url.includes('page=2'))) problems.push(`scrolling did not request page=2 (${requests.pages.join(', ')})`)
        const all = await page.bodyText()
        for (const game of FILLER) {
            const count = all.split(game.name).length - 1
            if (count !== 1) problems.push(`${game.name} shows ${count} times`)
        }
        await shot('catalogue-end-375.png')

        const sortMark = page.eventMark()
        await page.clickLabel('Sort: Name')
        await page.clickLabel('ScreenPeak rating')
        await page.waitForText('Sort: ScreenPeak rating')
        await page.waitUntil(`(() => {
            const first = [...document.querySelectorAll('[role="link"]')].find((node) => (node.getAttribute('aria-label') || '').startsWith('Verify Catalogue'))
            return first && first.getAttribute('aria-label') === ${JSON.stringify(TRENDING.name)} ? 'ok' : (first ? first.getAttribute('aria-label') : 'none')
        })()`, 30_000)
        await page.clickLabel('Sort descending — tap for ascending')
        await waitForRequest(sortMark, (url) => url.includes('sort=ngplus_rating') && url.includes('order=asc'), 'the ascending score sort')
        requests.sort = urls(sortMark, '/api/v1/games?')
        if (!requests.sort.some((url) => url.includes('sort=ngplus_rating') && url.includes('order=desc'))) problems.push('the score sort did not request order=desc')

        // Remove the developer chip, then pick the developer again from the typeahead.
        await page.clickLabel(`Remove Developer: ${DEVELOPER.name}`)
        await page.waitUntil(`document.body.innerText.includes(${JSON.stringify(`Developer: ${DEVELOPER.name}`)}) ? 'waiting' : 'ok'`, 30_000)
        const typeMark = page.eventMark()
        await page.clickLabel('Filters')
        await page.clickLabel('Developer: Any')
        await page.fillLabel('Search developer', 'Verify Wo')
        await waitForLabel(DEVELOPER.name)
        await shot('filters-375.png')
        await page.clickLabel(DEVELOPER.name)
        await page.clickControl('Close')
        await page.waitForText(`Developer: ${DEVELOPER.name}`, 30_000)
        await waitForRequest(typeMark, (url) => url.includes('/api/v1/games?') && url.includes(`developer=${DEVELOPER.slug}`), 'the developer filter')
        requests.typeahead = urls(typeMark, '/api/v1/taxonomy/developers/search')
        if (requests.typeahead.length < 1) problems.push('the developer picker did not search the server')

        await page.setViewport(320, 568)
        await shot('catalogue-320.png')

        await writeFile(join(dir, 'result.json'), JSON.stringify({ feature: 'mobile-explore', expo: expoOrigin, shots, requests, genre, problems }, null, 2))
    } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error))
        try { await page?.screenshot(join(dir, 'failed.png')) } catch { /* the page may already be gone */ }
        try {
            await writeFile(join(dir, 'result.json'), JSON.stringify({ feature: 'mobile-explore', shots, requests, problems }, null, 2))
        } catch { /* evidence dir may be missing */ }
        code = 1
    } finally {
        page?.close()
        stopChrome(chromePid)
        stopExpo(expoPid)
        deleteFixture()
    }
    if (problems.length) console.error(problems.join('\n'))
    if (code !== 0 || problems.length) process.exit(code || 1)
    log(`proved mobile-explore evidence ${dir}`)
}
