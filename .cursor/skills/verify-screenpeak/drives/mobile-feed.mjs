// drive mobile-feed: the recipe is ../features/mobile-feed.md.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { startExpo, stopExpo } from '../apps.mjs'
import { connectChrome, launchChrome, stopChrome } from '../browser.mjs'
import { appPort, databaseUrl, evidenceRoot, expoPort, novaEmail, novaUsername, peekEmail, peekPassword, peekUsername } from '../config.mjs'
import { psql } from '../database.mjs'
import { readPublicEnv } from '../env.mjs'
import { assertUuid, deleteNova, peekLibraryGames } from '../fixtures.mjs'
import { fail, log, portOpen, requireDoctor, waitForHttp } from '../runtime.mjs'

// More than one page (FEED_PAGE_SIZE is 12), all written in one transaction so
// every row ties on created_at and only migration 0011's tie-breakers order them.
const SHELVES = Array.from({ length: 14 }, (_, i) => `Nova shelf ${String(i + 1).padStart(2, '0')}`)
const LONG_REVIEW = 'A descent that keeps finding new things to say about the same four rooms, '
    + 'and every return trip lands differently because the build in your hands changed. '
    + 'It earns the replay it asks for.'

function insertNovaActivity(reviewGameId, ratedGameId) {
    psql(databaseUrl, `
        INSERT INTO auth.users (id, email, raw_user_meta_data)
        SELECT gen_random_uuid(), '${novaEmail}', '{"username":"${novaUsername}"}'::jsonb
        WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = '${novaEmail}');
        UPDATE public.users SET library_public = true WHERE username = '${novaUsername}';
        INSERT INTO follows (follower_id, following_id)
        SELECT a.id, b.id FROM users a, users b WHERE a.username = '${peekUsername}' AND b.username = '${novaUsername}'
        ON CONFLICT DO NOTHING;
        INSERT INTO ratings_reviews (user_id, game_id, rating, review)
        SELECT u.id, rows.game_id, rows.rating, rows.review
        FROM users u
        JOIN (VALUES ('${reviewGameId}'::uuid, 9, '${LONG_REVIEW}'), ('${ratedGameId}'::uuid, 7, NULL)) AS rows(game_id, rating, review) ON true
        WHERE u.username = '${novaUsername}';
        INSERT INTO library_entries (user_id, game_id, status, source)
        SELECT u.id, g.id, 'backlog', 'manual'
        FROM users u, (SELECT id FROM games ORDER BY name LIMIT 3) g
        WHERE u.username = '${novaUsername}';
        INSERT INTO lists (user_id, name, description, is_public, is_default, is_pinned)
        SELECT u.id, shelf, 'A shelf for the feed drive.', true, false, false
        FROM users u, unnest(ARRAY[${SHELVES.map((name) => `'${name}'`).join(', ')}]) AS shelf
        WHERE u.username = '${novaUsername}';
    `)
}

function unfollowNova() {
    psql(databaseUrl, `
        DELETE FROM follows
        WHERE follower_id = (SELECT id FROM users WHERE username = '${peekUsername}')
          AND following_id = (SELECT id FROM users WHERE username = '${novaUsername}');
    `)
}

// The feed list is the one scrollable element on the tab. Scroll it to the end
// each poll so onEndReached asks for the next page.
const SCROLL_TO_END = `(() => {
    for (const node of document.querySelectorAll('div')) {
        const style = getComputedStyle(node)
        if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) node.scrollTop = node.scrollHeight
    }
})()`

export async function driveMobileFeed() {
    requireDoctor()
    if (await portOpen(expoPort)) fail(`Port ${expoPort} is already in use. Not starting Expo.`)
    const games = peekLibraryGames()
    if (games.length < 2) fail('peek needs two library games before the feed drive.')
    const [reviewGame, ratedGame] = games
    assertUuid(reviewGame.id, 'review game')
    assertUuid(ratedGame.id, 'rated game')
    const reviewSlug = psql(databaseUrl, `select slug from games where id = '${reviewGame.id}'::uuid`, ['-tA'])
    const publicEnv = readPublicEnv()
    const dir = join(evidenceRoot, 'mobile-feed')
    await mkdir(dir, { recursive: true })
    const origin = `http://127.0.0.1:${appPort}`
    const expoOrigin = `http://localhost:${expoPort}`
    const problems = []
    const shots = {}
    const visits = {}
    let page = null
    let chromePid = null
    let expoPid = null
    let code = 0
    let feedRequests = []
    let shelfCounts = {}
    try {
        deleteNova()
        insertNovaActivity(reviewGame.id, ratedGame.id)
        const tied = psql(databaseUrl, `
            select count(distinct created_at) from get_feed(
                p_user_id => (select id from users where username = '${peekUsername}'), p_limit => 100, p_offset => 0)
        `, ['-tA'])
        if (tied !== '1') problems.push(`expected every feed row to share one created_at, got ${tied} timestamps`)
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
        async function backToFeed() {
            await page.clickControl('Back')
            await page.waitUntil(`location.pathname === '/' ? 'ok' : location.pathname`, 30_000)
        }

        await page.navigate(`${expoOrigin}/sign-in`)
        await page.waitForText('Log in')
        await page.fillPlaceholder('Email', peekEmail)
        await page.fillPlaceholder('Password', peekPassword)
        await page.clickControl('Log in')
        await page.waitUntil(`location.pathname.includes('sign-in') ? 'waiting' : 'ok'`, 30_000)
        await page.waitUntil(`document.querySelector('[role="tab"]') ? 'ok' : 'waiting'`, 30_000)

        await page.setViewport(375, 667)
        const mark = page.eventMark()
        await page.clickTab('Feed')
        await page.waitForText(`created the list "${SHELVES[0]}"`, 45_000)
        const first = await shot('feed-375.png')
        if (first.includes('Your feed is quiet')) problems.push('the first page shows the empty state')
        if (!first.includes('ago') && !first.includes('just now')) problems.push('the first page has no time-ago labels')

        await page.waitUntil(`(() => {
            ${SCROLL_TO_END}
            const text = document.body.innerText || ''
            return ${JSON.stringify(SHELVES)}.every((name) => text.includes('created the list "' + name + '"')) ? 'ok' : 'waiting'
        })()`, 45_000)
        feedRequests = page.requestUrlsSince(mark).filter((url) => url.includes('/api/v1/feed'))
        if (!feedRequests.some((url) => url.includes('offset=12'))) problems.push(`scrolling did not request offset=12 (${feedRequests.join(', ')})`)
        const all = await page.bodyText()
        shelfCounts = Object.fromEntries(SHELVES.map((name) => [name, all.split(`created the list "${name}"`).length - 1]))
        for (const [name, count] of Object.entries(shelfCounts)) {
            if (count !== 1) problems.push(`${name} appears ${count} times across pages`)
        }
        for (const line of [`reviewed ${reviewGame.name}`, `rated ${ratedGame.name} a 7/10`, 'added 3 games to their library']) {
            if (!all.includes(line)) problems.push(`the feed is missing "${line}"`)
        }
        await shot('feed-end-375.png')

        await page.clickControl('Read more')
        await page.waitForText('Show less')
        await shot('review-expanded-375.png')

        await page.clickLabel(reviewGame.name)
        await waitForPath(`/games/${reviewSlug}`)
        visits.game = `/games/${reviewSlug}`
        await backToFeed()

        const opened = await page.evaluate(`(() => {
            const link = [...document.querySelectorAll('[role="link"]')].find((node) => node.textContent.trim() === ${JSON.stringify(novaUsername)})
            if (!link) return 'missing'
            link.click()
            return 'clicked'
        })()`)
        if (opened !== 'clicked') problems.push('the username link is missing')
        else {
            await waitForPath(`/user/${novaUsername}`)
            visits.profile = `/user/${novaUsername}`
            await backToFeed()
        }

        await page.clickLabel(`${novaUsername}'s library`)
        await waitForPath(`/user/${novaUsername}/library`)
        visits.library = `/user/${novaUsername}/library`
        await backToFeed()

        await page.setViewport(320, 568)
        await shot('feed-320.png')

        unfollowNova()
        await page.navigate(`${expoOrigin}/`)
        await page.waitForText('Your feed is quiet', 45_000)
        await shot('empty-320.png')
        await page.clickControl('Find people to follow')
        await waitForPath('/explore')
        visits.explore = '/explore'

        await writeFile(join(dir, 'result.json'), JSON.stringify({
            feature: 'mobile-feed',
            expo: expoOrigin,
            shots,
            feedRequests,
            shelfCounts,
            visits,
            problems,
        }, null, 2))
    } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error))
        try { await page?.screenshot(join(dir, 'failed.png')) } catch { /* the page may already be gone */ }
        try {
            await writeFile(join(dir, 'result.json'), JSON.stringify({ feature: 'mobile-feed', shots, feedRequests, shelfCounts, visits, problems }, null, 2))
        } catch { /* evidence dir may be missing */ }
        code = 1
    } finally {
        page?.close()
        stopChrome(chromePid)
        stopExpo(expoPid)
        deleteNova()
    }
    if (problems.length) console.error(problems.join('\n'))
    if (code !== 0 || problems.length) process.exit(code || 1)
    log(`proved mobile-feed evidence ${dir}`)
}
