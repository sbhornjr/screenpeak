// drive mobile-ratings: the recipe is ../features/mobile-ratings.md.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { startExpo, stopExpo } from '../apps.mjs'
import { connectChrome, launchChrome, stopChrome } from '../browser.mjs'
import { adaUsername, appPort, databaseUrl, evidenceRoot, expoPort, peekUsername } from '../config.mjs'
import { psql } from '../database.mjs'
import { readPublicEnv } from '../env.mjs'
import { deleteAda, insertPrivateAda } from '../fixtures.mjs'
import { fail, log, portOpen, requireDoctor, waitForHttp } from '../runtime.mjs'

// 25 ratings at one score and one instant: with peek's own five, more than one
// page (20), and every Rating-sort page boundary falls inside a tie that only
// migration 0012's tie-breakers order. igdb_id stays clear of real ids.
const FILLER = Array.from({ length: 25 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0')
    return { name: `Verify Rated ${n}`, slug: `verify-rated-${n}`, igdbId: 990_000_200 + i, reviewed: i < 3 }
})
const SCORE_ONLY = FILLER.filter((game) => !game.reviewed)
const REVIEWED = FILLER.filter((game) => game.reviewed)
const LONG_REVIEW = 'Every run teaches the next one something, and the third act finally pays off the patience '
    + 'the first two asked for. The controls stay tight from the opening room to the last, and the soundtrack '
    + 'keeps pace without ever getting in the way. Worth the eight.'
const AT = '2026-09-01 12:00:00+00'

function insertFixture() {
    psql(databaseUrl, `
        INSERT INTO games (igdb_id, name, slug, released)
        VALUES ${FILLER.map((game) => `(${game.igdbId}, '${game.name}', '${game.slug}', '2023-06-01')`).join(', ')};
        INSERT INTO ratings_reviews (user_id, game_id, rating, review, created_at, updated_at)
        SELECT u.id, g.id, 8,
            CASE WHEN g.slug = '${REVIEWED[0].slug}' THEN '${LONG_REVIEW}'
                 WHEN g.slug IN (${REVIEWED.slice(1).map((game) => `'${game.slug}'`).join(', ')}) THEN 'Short and sharp.'
                 ELSE '' END,
            '${AT}', '${AT}'
        FROM users u, games g
        WHERE u.username = '${peekUsername}' AND g.slug LIKE 'verify-rated-%';
    `)
}

function deleteFixture() {
    deleteAda()
    try {
        psql(databaseUrl, `DELETE FROM games WHERE slug LIKE 'verify-rated-%';`)
    } catch (error) {
        log(error instanceof Error ? error.message : String(error))
    }
}

function peekCounts() {
    const line = psql(databaseUrl, `
        select concat_ws(E'\\t', rating_count, review_count, total_count)
        from get_user_ratings_reviews_counts(p_user_id => (select id from users where username = '${peekUsername}'))
    `, ['-tA'])
    const [ratings, reviews, total] = line.split('\t').map(Number)
    const word = (n, one, many) => `${n} ${n === 1 ? one : many}`
    return `${word(ratings, 'rating', 'ratings')} / ${word(reviews, 'review', 'reviews')} / ${total} total`
}

// The list is the one scrollable element on the page. Scroll it to the end so
// onEndReached asks for the next page.
const SCROLL_TO_END = `(() => {
    for (const node of document.querySelectorAll('div')) {
        const style = getComputedStyle(node)
        if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) node.scrollTop = node.scrollHeight
    }
})()`

export async function driveMobileRatings() {
    requireDoctor()
    if (await portOpen(expoPort)) fail(`Port ${expoPort} is already in use. Not starting Expo.`)
    const publicEnv = readPublicEnv()
    const dir = join(evidenceRoot, 'mobile-ratings')
    await mkdir(dir, { recursive: true })
    const origin = `http://127.0.0.1:${appPort}`
    const expoOrigin = `http://localhost:${expoPort}`
    const problems = []
    const shots = {}
    const requests = {}
    const visits = {}
    let rowCounts = {}
    let page = null
    let chromePid = null
    let expoPid = null
    let code = 0
    try {
        deleteFixture()
        insertFixture()
        insertPrivateAda()
        const counts = peekCounts()
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
        // The requests are recorded in this process, so poll them here, not in the page.
        async function waitForRequest(mark, test, what, timeoutMs = 30_000) {
            const deadline = Date.now() + timeoutMs
            while (Date.now() < deadline) {
                if (page.requestUrlsSince(mark).some(test)) return
                await new Promise((resolve) => setTimeout(resolve, 250))
            }
            throw new Error(`No request for ${what}`)
        }
        const ratingsUrl = (url) => url.includes(`/api/v1/user/${peekUsername}/ratings_reviews`)

        // Signed out: the page is public.
        await page.setViewport(375, 667)
        await page.navigate(`${expoOrigin}/user/${peekUsername}/ratings_reviews`)
        await page.waitForText(`${peekUsername}'s Ratings & Reviews`, 180_000)
        const first = await shot('ratings-375.png')
        if (!first.includes(counts)) problems.push(`the counts line is not "${counts}"`)

        // Sort by rating: almost every row ties, so this is where pages could overlap.
        const sortMark = page.eventMark()
        await page.clickLabel('Sort: Date')
        await page.clickLabel('Rating')
        await waitForRequest(sortMark, (url) => ratingsUrl(url) && url.includes('sort=rating') && url.includes('order=desc'), 'the rating sort')
        await page.waitForText('Sort: Rating')
        await page.waitUntil(`(() => {
            ${SCROLL_TO_END}
            const text = document.body.innerText || ''
            return ${JSON.stringify(FILLER.map((game) => game.name))}.every((name) => text.includes(name)) ? 'ok' : 'waiting'
        })()`, 45_000)
        requests.pages = page.requestUrlsSince(sortMark).filter(ratingsUrl)
        if (!requests.pages.some((url) => url.includes('page=2'))) problems.push(`scrolling did not request page=2 (${requests.pages.join(', ')})`)
        const all = await page.bodyText()
        rowCounts = Object.fromEntries(FILLER.map((game) => [game.name, all.split(game.name).length - 1]))
        for (const [name, count] of Object.entries(rowCounts)) {
            if (count !== 1) problems.push(`${name} shows ${count} times across pages`)
        }
        await shot('ratings-end-375.png')

        // Only written reviews, then the long one expanded.
        const showMark = page.eventMark()
        await page.clickLabel('Show: All')
        await page.clickLabel('Reviews')
        await waitForRequest(showMark, (url) => ratingsUrl(url) && url.includes('filter=reviews'), 'the Reviews filter')
        await page.waitUntil(`document.body.innerText.includes(${JSON.stringify(SCORE_ONLY[0].name)}) ? 'waiting' : 'ok'`, 30_000)
        const reviews = await page.bodyText()
        for (const game of REVIEWED) {
            if (!reviews.includes(game.name)) problems.push(`Reviews is missing ${game.name}`)
        }
        await page.clickControl('Read more')
        await page.waitForText('Show less')
        await shot('reviews-expanded-375.png')

        await page.clickLabel('Show: Reviews')
        await page.clickLabel('Ratings')
        await waitForRequest(showMark, (url) => ratingsUrl(url) && url.includes('filter=ratings'), 'the Ratings filter')
        await page.waitUntil(`document.body.innerText.includes(${JSON.stringify(REVIEWED[0].name)}) ? 'waiting' : 'ok'`, 30_000)
        await shot('score-only-375.png')
        requests.filters = page.requestUrlsSince(showMark).filter(ratingsUrl)

        // A row opens its game, and the profile link opens the player.
        await page.clickLabel(`${SCORE_ONLY[0].name}, 8 out of 10`)
        await waitForPath(`/games/${SCORE_ONLY[0].slug}`)
        visits.game = `/games/${SCORE_ONLY[0].slug}`
        await page.clickControl('Back')
        await waitForPath(`/user/${peekUsername}/ratings_reviews`)
        await page.clickLabel(`${peekUsername}'s profile`)
        await waitForPath(`/user/${peekUsername}`)
        visits.profile = `/user/${peekUsername}`

        await page.setViewport(320, 568)
        await page.navigate(`${expoOrigin}/user/${peekUsername}/ratings_reviews`)
        await page.waitForText(`${peekUsername}'s Ratings & Reviews`, 45_000)
        await shot('ratings-320.png')

        // A player with no ratings keeps Show, so an empty filter can be switched back.
        await page.navigate(`${expoOrigin}/user/${adaUsername}/ratings_reviews`)
        await page.waitForText('No ratings yet.', 45_000)
        await shot('empty-320.png')
        await page.clickLabel('Show: All')
        await page.clickLabel('Reviews')
        await page.waitForText('No written reviews yet.', 30_000)
        await page.clickLabel('Show: Reviews')
        await page.clickLabel('All')
        await page.waitForText('No ratings yet.', 30_000)

        await writeFile(join(dir, 'result.json'), JSON.stringify({ feature: 'mobile-ratings', expo: expoOrigin, counts, shots, requests, rowCounts, visits, problems }, null, 2))
    } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error))
        try { await page?.screenshot(join(dir, 'failed.png')) } catch { /* the page may already be gone */ }
        try {
            await writeFile(join(dir, 'result.json'), JSON.stringify({ feature: 'mobile-ratings', shots, requests, rowCounts, visits, problems }, null, 2))
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
    log(`proved mobile-ratings evidence ${dir}`)
}
