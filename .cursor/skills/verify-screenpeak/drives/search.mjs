// drive search: the recipe is ../features/search.md.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { connectChrome, launchChrome, stopChrome } from '../browser.mjs'
import { appPort, databaseUrl, evidenceRoot, peekEmail, peekPassword, peekUsername } from '../config.mjs'
import { psql } from '../database.mjs'
import { assertUuid } from '../fixtures.mjs'
import { log, requireDoctor } from '../runtime.mjs'

function searchTarget() {
    const line = psql(databaseUrl, `
        select g.name || chr(31) || d.name || chr(31) || p.name || chr(31) || coalesce(g.cover_image_url, '')
        from games g
        join ratings_reviews rr on rr.game_id = g.id
        join users u on u.id = rr.user_id
        join game_developers gd on gd.game_id = g.id
        join developers d on d.id = gd.developer_id
        join game_publishers gp on gp.game_id = g.id
        join publishers p on p.id = gp.publisher_id
        where u.username = '${peekUsername}'
        order by g.slug
        limit 1
    `, ['-tA'])
    if (!line) throw new Error('peek has no rated game with a developer and a publisher to search.')
    const [name, developer, publisher, cover] = line.split('\x1f')
    if (!name || !developer || !publisher) throw new Error(`search target was incomplete: ${line}`)
    return { name, developer, publisher, cover: cover || null }
}

export async function driveSearch() {
    requireDoctor()
    const target = searchTarget()
    const dir = join(evidenceRoot, 'search')
    await mkdir(dir, { recursive: true })
    const origin = `http://127.0.0.1:${appPort}`
    const problems = []
    const record = {
        feature: 'search',
        name: target.name,
        developer: target.developer,
        publisher: target.publisher,
        storedCover: target.cover,
    }

    async function getJson(path, headers = {}) {
        const res = await fetch(`${origin}${path}`, { headers })
        const body = await res.json().catch(() => null)
        return { status: res.status, body, cache: res.headers.get('cache-control') }
    }

    const gamePath = `/api/v1/games/search?q=${encodeURIComponent(target.name)}`
    const found = await getJson(gamePath)
    record.gameStatus = found.status
    const payload = JSON.stringify(found.body)
    const hit = Array.isArray(found.body?.games)
        ? found.body.games.find(game => game.name === target.name)
        : null
    if (found.status !== 200) problems.push(`game search status ${found.status}`)
    if (!hit) problems.push(`game search missed ${target.name}`)
    else {
        try { assertUuid(hit.id, 'game id') } catch (error) {
            problems.push(error instanceof Error ? error.message : String(error))
        }
        record.avg_rating = hit.avg_rating
        record.cover_image_url = hit.cover_image_url
        if (typeof hit.avg_rating !== 'number') problems.push(`avg_rating ${hit.avg_rating}`)
    }
    if (payload.includes('avg_ngplus_rating')) problems.push('game search included avg_ngplus_rating')
    if (found.cache !== 'private, no-store') problems.push(`cache ${found.cache}`)
    if (target.cover && target.cover.includes('images.igdb.com')) {
        const cover = hit?.cover_image_url ?? ''
        if (!String(cover).includes('/t_cover_big_2x/')) problems.push(`cover was not a display URL: ${cover}`)
    } else if (hit && hit.cover_image_url !== null) {
        problems.push(`cover should be null, got ${hit.cover_image_url}`)
    }

    const empty = await getJson('/api/v1/games/search?q=')
    record.emptyStatus = empty.status
    record.emptyCode = empty.body?.error?.code ?? null
    if (empty.status !== 400 || empty.body?.error?.code !== 'invalid_request') {
        problems.push(`empty query status ${empty.status} ${empty.body?.error?.code}`)
    }
    const capped = await getJson(`${gamePath}&limit=21`)
    record.limitStatus = capped.status
    if (capped.status !== 400 || capped.body?.error?.code !== 'invalid_request') {
        problems.push(`limit=21 status ${capped.status}`)
    }

    const taxonomy = await getJson(`/api/v1/taxonomy/developers/search?q=${encodeURIComponent(target.developer)}`)
    record.taxonomyStatus = taxonomy.status
    const developerHit = Array.isArray(taxonomy.body?.results)
        ? taxonomy.body.results.find(row => row.name === target.developer)
        : null
    if (taxonomy.status !== 200 || !developerHit) problems.push(`developer search status ${taxonomy.status}`)
    else {
        try { assertUuid(developerHit.id, 'developer id') } catch (error) {
            problems.push(error instanceof Error ? error.message : String(error))
        }
    }
    const publishers = await getJson(`/api/v1/taxonomy/publishers/search?q=${encodeURIComponent(target.publisher)}`)
    record.publisherStatus = publishers.status
    const publisherHit = Array.isArray(publishers.body?.results)
        ? publishers.body.results.find(row => row.name === target.publisher)
        : null
    if (publishers.status !== 200 || !publisherHit) problems.push(`publisher search status ${publishers.status}`)
    else {
        try { assertUuid(publisherHit.id, 'publisher id') } catch (error) {
            problems.push(error instanceof Error ? error.message : String(error))
        }
    }
    const genres = await getJson('/api/v1/taxonomy/genres/search?q=a')
    record.genresStatus = genres.status
    if (genres.status !== 400 || genres.body?.error?.code !== 'invalid_request') {
        problems.push(`genres status ${genres.status}`)
    }

    const cookieOnly = await getJson(gamePath, { Cookie: 'sb-access-token=website-session' })
    record.cookieOnlyStatus = cookieOnly.status
    if (cookieOnly.status !== 200) problems.push(`cookie-only status ${cookieOnly.status}`)
    const badBearer = await getJson(gamePath, { Authorization: 'Bearer not-a-token' })
    record.badBearerStatus = badBearer.status
    record.badBearerCode = badBearer.body?.error?.code ?? null
    if (badBearer.status !== 401 || badBearer.body?.error?.code !== 'invalid_token') {
        problems.push(`bad bearer status ${badBearer.status} ${badBearer.body?.error?.code}`)
    }

    let chromePid = null
    let page = null
    try {
        chromePid = await launchChrome()
        page = await connectChrome()
        try {
        await page.navigate(`${origin}/games`)
        await page.clickButton('+ Filters')
        await page.waitForText('- Filters')
        await page.clickPlaceholder('All Developers')
        await page.fillPlaceholder('All Developers', target.developer)
        await page.waitUntil(`(() => {
            const hit = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === ${JSON.stringify(target.developer)} && item.className.includes('text-left'))
            return hit ? 'ok' : 'no-result'
        })()`)
        await page.screenshot(join(dir, 'filters.png'))
        const filtersText = await page.bodyText()
        if (!filtersText.includes(target.developer)) problems.push('the filters page does not include the developer')

        await page.clickButton('Sign In')
        await page.waitForText('Password')
        await page.fillPlaceholder('Email', peekEmail)
        await page.fillPlaceholder('Password', peekPassword)
        await page.clickDialogButton('Sign In')
        await page.waitForText(peekUsername)
        await page.navigate(`${origin}/user/${peekUsername}`)
        await page.waitForText('FAVORITE GAMES')
        await page.clickSectionButton('Favorite Games')
        await page.waitForText('CHOOSE FAVORITE GAMES')
        await page.fillPlaceholder('Search games...', target.name)
        await page.waitUntil(`(() => {
            const dialog = document.querySelector('[role="dialog"]')
            if (!dialog) return 'no-dialog'
            const heading = [...dialog.querySelectorAll('h3')].find((item) => item.textContent.trim() === ${JSON.stringify(target.name)})
            return heading ? 'ok' : 'no-result'
        })()`)
        await page.screenshot(join(dir, 'favorites.png'))
        const dialogText = await page.bodyText()
        if (!dialogText.includes('CHOOSE FAVORITE GAMES') || !dialogText.toUpperCase().includes(target.name.toUpperCase())) {
            problems.push('the favorite picker does not include the game')
        }
        } catch (error) {
            problems.push(error instanceof Error ? error.message : String(error))
            try { await page.screenshot(join(dir, 'failed.png')) } catch { /* the page may already be gone */ }
        }
    } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error))
    } finally {
        page?.close()
        stopChrome(chromePid)
    }

    record.problems = problems
    await writeFile(join(dir, 'result.json'), JSON.stringify(record, null, 2))
    if (problems.length) {
        console.error(problems.join('\n'))
        process.exit(1)
    }
    log(`proved search evidence ${dir}`)
}
