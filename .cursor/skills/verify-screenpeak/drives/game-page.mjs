// drive game-page: the recipe is ../features/game-page.md.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { connectChrome, launchChrome, stopChrome } from '../browser.mjs'
import { appPort, databaseUrl, evidenceRoot, peekEmail, peekPassword, peekUsername } from '../config.mjs'
import { psql } from '../database.mjs'
import { log, requireDoctor } from '../runtime.mjs'

function ratedGame() {
    const line = psql(databaseUrl, `
        select g.slug || '|' || g.name || '|' || coalesce(g.cover_image_url, '')
        from games g
        join ratings_reviews rr on rr.game_id = g.id
        join users u on u.id = rr.user_id
        where u.username = '${peekUsername}'
        order by g.slug
        limit 1
    `, ['-tA'])
    if (!line) throw new Error('peek has no rated game to open.')
    const [slug, name, cover] = line.split('|')
    return { slug, name, cover: cover || null }
}

export async function driveGamePage() {
    requireDoctor()
    const game = ratedGame()
    const dir = join(evidenceRoot, 'game-page')
    await mkdir(dir, { recursive: true })
    const gameUrl = `http://127.0.0.1:${appPort}/api/v1/games/${encodeURIComponent(game.slug)}`
    const reviewsUrl = `${gameUrl}/reviews`
    const gameRes = await fetch(gameUrl)
    const gameBody = await gameRes.json()
    const reviewsRes = await fetch(reviewsUrl)
    const reviewsBody = await reviewsRes.json()
    const payload = JSON.stringify(gameBody)
    const cover = gameBody?.game?.cover_image_url ?? null
    const problems = []
    if (gameRes.status !== 200) problems.push(`game status ${gameRes.status}`)
    if (gameBody?.game?.name !== game.name) problems.push(`name ${gameBody?.game?.name} != ${game.name}`)
    if (gameBody?.game?.slug !== game.slug) problems.push(`slug ${gameBody?.game?.slug}`)
    if (gameBody?.viewer !== null) problems.push('viewer was not null')
    if (typeof gameBody?.stats?.avg_rating !== 'number') problems.push(`avg_rating ${gameBody?.stats?.avg_rating}`)
    if (payload.includes('steam_appid') || payload.includes('metacritic') || payload.includes('avg_ngplus_rating')) {
        problems.push('payload includes a retired field')
    }
    if (game.cover && (!cover || !cover.includes('/t_cover_big_2x/') || !cover.startsWith('https://images.igdb.com/'))) {
        problems.push(`cover was not a display URL: ${cover}`)
    }
    if (!game.cover && cover !== null) problems.push(`cover should be null, got ${cover}`)
    if (reviewsRes.status !== 200 || !Array.isArray(reviewsBody?.reviews)) problems.push(`reviews status ${reviewsRes.status}`)
    const chromePid = await launchChrome()
    let page = null
    try {
        page = await connectChrome()
        await page.navigate(`http://127.0.0.1:${appPort}/games/${encodeURIComponent(game.slug)}`)
        await page.waitForText(game.name)
        await page.screenshot(join(dir, 'page.png'))
        const bodyText = await page.bodyText()
        const folded = bodyText.toLowerCase()
        if (!bodyText.includes(game.name)) problems.push('the page text does not include the game name')
        if (!folded.includes('in your library')) problems.push('signed-out page is missing In your library')
        if (!folded.includes('sign in to add this game to your library.')) problems.push('signed-out page is missing the library sign-in line')
        if (folded.includes('your save')) problems.push('signed-out page still says Your save')
        const statsLine = psql(databaseUrl, `
            select coalesce(rr.rating::text, '') || '|' || coalesce(le.status, '') || '|' || coalesce(le.hours_played::text, '') || '|' || coalesce(le.play_count::text, '') || '|' || coalesce(le.completed_all_achievements::text, '')
            from library_entries le
            join games g on g.id = le.game_id
            join users u on u.id = le.user_id
            left join ratings_reviews rr on rr.user_id = u.id and rr.game_id = g.id
            where u.username = '${peekUsername}' and g.slug = '${game.slug}'
        `, ['-tA'])
        await page.clickButton('Sign In')
        await page.waitForText('Password')
        await page.fillPlaceholder('Email', peekEmail)
        await page.fillPlaceholder('Password', peekPassword)
        await page.clickDialogButton('Sign In')
        await page.waitForText(peekUsername)
        await page.navigate(`http://127.0.0.1:${appPort}/games/${encodeURIComponent(game.slug)}`)
        if (!statsLine) {
            problems.push('peek has no library row for this game')
        } else {
            const [rating, status, hours, plays, done] = statsLine.split('|')
            const hoursText = hours === '' ? '—' : String(Number(hours))
            const statusLabel = status ? status.charAt(0).toUpperCase() + status.slice(1) : ''
            const needle = rating ? `${rating}/10` : statusLabel
            await page.waitForText(needle)
            await page.screenshot(join(dir, 'library.png'))
            const signedInText = await page.bodyText()
            const labels = await page.ariaLabels()
            if (!labels.includes(`Hours played ${hoursText}`)) problems.push(`signed-in page missing hours label ${hoursText}`)
            if (!labels.includes(`Times played ${plays}`)) problems.push(`signed-in page missing times played ${plays}`)
            const complete = done === 't' || done === 'true'
            if (complete && !labels.includes('100% achievements completed')) problems.push('signed-in page is missing the 100% trophy')
            if (!complete && labels.includes('100% achievements completed')) problems.push('100% trophy showed while the flag is off')
            if (rating && !signedInText.includes(`${rating}/10`)) problems.push(`signed-in page missing ${rating}/10`)
            if (statusLabel && !signedInText.toLowerCase().includes(statusLabel.toLowerCase())) problems.push(`signed-in page missing status ${statusLabel}`)
            if (/\bStatus\b/.test(signedInText) || signedInText.includes('Your score')) problems.push('library card still uses Status or Your score labels')
            if (signedInText.includes('Sign in to add this game to your library.')) problems.push('signed-in page still asks to sign in to add the game')
        }
        if (!statsLine) await page.screenshot(join(dir, 'library.png'))
    } finally {
        page?.close()
        stopChrome(chromePid)
    }
    const result = {
        feature: 'game-page',
        slug: game.slug,
        name: game.name,
        storedCover: game.cover,
        apiStatus: gameRes.status,
        viewer: gameBody?.viewer ?? null,
        avg_rating: gameBody?.stats?.avg_rating ?? null,
        cover_image_url: cover,
        reviewsStatus: reviewsRes.status,
        reviewCount: Array.isArray(reviewsBody?.reviews) ? reviewsBody.reviews.length : null,
        problems,
    }
    await writeFile(join(dir, 'result.json'), JSON.stringify(result, null, 2))
    if (problems.length) {
        console.error(problems.join('\n'))
        process.exit(1)
    }
    log(`proved game-page evidence ${dir}`)
}
