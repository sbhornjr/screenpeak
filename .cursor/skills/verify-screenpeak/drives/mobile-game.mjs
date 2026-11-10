// drive mobile-game: the recipe is ../features/mobile-game.md.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { startExpo, stopExpo } from '../apps.mjs'
import { connectChrome, launchChrome, stopChrome } from '../browser.mjs'
import { appPort, databaseUrl, evidenceRoot, expoPort, peekEmail, peekPassword } from '../config.mjs'
import { psql } from '../database.mjs'
import { readPublicEnv } from '../env.mjs'
import { peekAccessToken, peekCounts, peekWriteTarget, restorePeekWrites } from '../fixtures.mjs'
import { fail, log, portOpen, requireDoctor, waitForHttp } from '../runtime.mjs'

export async function driveMobileGame() {
    requireDoctor()
    if (await portOpen(expoPort)) fail(`Port ${expoPort} is already in use. Not starting Expo.`)
    const target = peekWriteTarget()
    const beforeCounts = peekCounts()
    const nextRating = target.rating === 10 ? 9 : 10
    const nextStatus = target.status === 'playing' ? 'backlog' : 'playing'
    const nextStatusLabel = nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)
    const firstReview = 'Phone run one.'
    const editedReview = 'Phone run two.'
    const listName = 'Phone Shelf'
    const publicEnv = readPublicEnv()
    const dir = join(evidenceRoot, 'mobile-game')
    await mkdir(dir, { recursive: true })
    const origin = `http://127.0.0.1:${appPort}`
    const expoOrigin = `http://localhost:${expoPort}`
    const wishlist = psql(databaseUrl, `
        select id::text || '|' || name from lists
        where user_id = '${target.userId}'::uuid
        order by is_default desc, name
        limit 1
    `, ['-tA'])
    const [wishlistId, wishlistName] = (wishlist || '').split('|')
    const priorShots = JSON.parse(psql(databaseUrl, `
        select coalesce(array_to_json(screenshots)::text, '[]')
        from games where id = '${target.gameId}'::uuid
    `, ['-tA']) || '[]')
    const verifyShot = 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/scverify.jpg'
    const seededShot = !priorShots.some((url) => typeof url === 'string' && url.includes('/t_screenshot'))
    psql(databaseUrl, `
        delete from lists where user_id = '${target.userId}'::uuid and name = '${listName}';
        ${wishlistId ? `delete from list_games where list_id = '${wishlistId}'::uuid and game_id = '${target.gameId}'::uuid;` : ''}
    `)
    const expoPid = startExpo(origin, publicEnv)
    const problems = []
    const shots = {}
    const record = {
        feature: 'mobile-game',
        slug: target.slug,
        name: target.name,
        nextRating,
        nextStatus,
        wishlistName: wishlistName || null,
    }
    let page = null
    let chromePid = null
    let createdListId = ''
    try {
        if (seededShot) {
            psql(databaseUrl, `
                update games
                set screenshots = array_append(coalesce(screenshots, '{}'), '${verifyShot}')
                where id = '${target.gameId}'::uuid
            `)
        }
        await waitForHttp(expoOrigin, 180_000)
        chromePid = await launchChrome()
        page = await connectChrome()
        await page.setViewport(375, 667)

        async function reveal(needle) {
            await page.evaluate(`(() => {
                const needle = ${JSON.stringify(needle)}
                const nodes = [...document.querySelectorAll('body *')]
                const match = nodes.find((node) => {
                    const text = node.innerText || ''
                    return node.children.length < 6 && text.includes(needle) && text.length < 600
                })
                if (match) match.scrollIntoView({ block: 'center', inline: 'nearest' })
            })()`)
        }
        async function shot(name, needle, timeoutMs = 30_000) {
            await page.waitForText(needle, timeoutMs)
            await reveal(needle)
            const path = join(dir, name)
            await page.screenshot(path)
            shots[name] = path
            return page.bodyText()
        }

        await page.navigate(`${expoOrigin}/games/${encodeURIComponent(target.slug)}`)
        const signedOut = await shot('se-signed-out.png', target.name, 180_000)
        if (!signedOut.includes(target.name)) problems.push('signed-out game page is missing the name')
        const signedOutFolded = signedOut.toLowerCase()
        if (!signedOutFolded.includes('in your library')) problems.push('signed-out game page is missing In your library')
        if (!signedOutFolded.includes('sign in to add this game to your library.')) problems.push('signed-out game page is missing the library sign-in line')
        if (!signedOut.includes('Write a review')) problems.push('signed-out game page is missing Write a review')
        await shot('write-review.png', 'Write a review')
        if (signedOutFolded.includes('your save') || signedOut.includes('Open full size')) problems.push('signed-out game page still uses the old library or gallery wording')
        if (signedOut.includes('Sign up to rate, log, or list this game.')) problems.push('signup prompt is open before an action')
        await page.setViewport(320, 568)
        const narrow = await shot('cover-se.png', 'RELEASED')
        if (!narrow.toLowerCase().includes('released') || !narrow.includes(target.name)) problems.push('SE cover row is missing the release year')
        await page.setViewport(375, 667)
        const openedShot = await page.evaluate(`(() => {
            const node = [...document.querySelectorAll('button, [role="button"]')].find((item) => (item.getAttribute('aria-label') || '').startsWith('Screenshot '))
            if (!node) return 'missing'
            node.click()
            return node.getAttribute('aria-label') || 'clicked'
        })()`)
        if (openedShot === 'missing') problems.push('gallery screenshot control is missing')
        else {
            const viewer = await shot('screenshot-viewer.png', 'Close screenshot')
            if (viewer.includes('Open full size')) problems.push('gallery still offers Open full size')
            await page.clickLabel('Close screenshot')
            await page.waitUntil(`document.body.innerText.includes('Close screenshot') ? 'waiting' : 'ok'`)
        }
        await page.clickLabel('Rate')
        const prompt = await shot('signup.png', 'Sign up to rate, log, or list this game.')
        if (!prompt.includes('Sign up')) problems.push('signup prompt is missing Sign up')
        await page.clickControl('Log in')
        await page.waitForText('Password')
        const arrived = await page.bodyText()
        if (arrived.includes('Sign up to rate, log, or list this game.')) problems.push('signup sheet stayed open on the sign-in screen')
        const leftoverSheet = await page.evaluate(`(() => {
            const dialog = document.querySelector('[role="dialog"]')
            if (!dialog) return ''
            return dialog.getAttribute('aria-label') || dialog.innerText || 'dialog'
        })()`)
        if (leftoverSheet) problems.push(`signup sheet still open on sign-in: ${leftoverSheet}`)
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

        psql(databaseUrl, `
            update library_entries
            set hours_played = 12.5, play_count = 4, completed_all_achievements = true
            where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
        `)
        await page.navigate(`${expoOrigin}/games/${encodeURIComponent(target.slug)}`)
        const signedIn = await shot('se-signed-in.png', target.name)
        const signedInLabels = await page.ariaLabels()
        if (!signedIn.includes(`${target.rating}/10`)) problems.push('signed-in game page is missing your score')
        if (!signedInLabels.includes('Hours played 12.5')) problems.push('signed-in game page is missing hours')
        if (!signedInLabels.includes('Times played 4')) problems.push('signed-in game page is missing times played')
        if (!signedInLabels.includes('100% achievements completed')) problems.push('signed-in game page is missing the 100% flag')
        if (!signedIn.includes('12.5')) problems.push('signed-in game page is missing the hours value')
        await shot('library-stats.png', '12.5')
        if (signedIn.includes('Sign up to rate, log, or list this game.')) problems.push('signed-in game page opened the signup prompt')

        async function waitForRateSheetClosed() {
            await page.waitUntil(`(() => {
                const text = document.body.innerText || ''
                if (text.includes('Review note') || text.includes('Saving')) return 'waiting'
                return 'ok'
            })()`)
        }
        await page.clickLabel('Rate')
        await page.waitForText('Review note')
        await page.clickLabel(`Score ${nextRating}`)
        await page.fillLabel('Review note', firstReview)
        await page.clickControl('Submit rating')
        await waitForRateSheetClosed()
        const rated = await shot('review-saved.png', firstReview)
        if (!rated.includes(String(nextRating))) problems.push('saved review did not show the new score')
        if (!rated.includes('Edit your review')) problems.push('saved review did not offer Edit your review')
        await shot('edit-review.png', 'Edit your review')
        const reviewRow = psql(databaseUrl, `
            select rating::text || '|' || coalesce(review, '')
            from ratings_reviews
            where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
        `, ['-tA'])
        record.reviewAfterRate = reviewRow
        if (reviewRow !== `${nextRating}|${firstReview}`) problems.push(`postgres after rate ${reviewRow}`)

        await page.clickLabel('Rate')
        await page.waitForText('Review note')
        await page.fillLabel('Review note', editedReview)
        await page.clickControl('Submit rating')
        await waitForRateSheetClosed()
        await shot('review-edited.png', editedReview)
        const editedRow = psql(databaseUrl, `
            select rating::text || '|' || coalesce(review, '')
            from ratings_reviews
            where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
        `, ['-tA'])
        record.reviewAfterEdit = editedRow
        if (editedRow !== `${nextRating}|${editedReview}`) problems.push(`postgres after edit ${editedRow}`)

        await page.clickLabel('Rate')
        await page.waitForText('Delete review')
        await page.clickControl('Delete review')
        await page.waitForText('Delete this review? Your score stays.')
        await page.clickControl('Delete the written review')
        await waitForRateSheetClosed()
        await page.waitUntil(`document.body.innerText.includes(${JSON.stringify(editedReview)}) ? 'waiting' : 'ok'`)
        const deletedText = await page.bodyText()
        const deletedPath = join(dir, 'review-deleted.png')
        await page.screenshot(deletedPath)
        shots['review-deleted.png'] = deletedPath
        if (deletedText.includes(editedReview) || deletedText.includes(firstReview)) problems.push('deleted review text is still on the page')
        if (!deletedText.includes('Write a review')) problems.push('deleted review did not offer Write a review')
        if (!deletedText.includes(`${nextRating}/10`)) problems.push('deleting the review cleared the score')
        const deletedRow = psql(databaseUrl, `
            select rating::text || '|' || coalesce(review, '')
            from ratings_reviews
            where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
        `, ['-tA'])
        record.reviewAfterDelete = deletedRow
        if (deletedRow !== `${nextRating}|`) problems.push(`postgres after delete ${deletedRow}`)

        const libraryMark = page.eventMark()
        await page.clickLabel('Save game')
        await page.waitForText('Show library details')
        await page.clickLabel(`Log as ${nextStatus}`)
        await page.clickControl('Update library entry')
        await page.waitUntil(`document.body.innerText.includes('Show library details') ? 'waiting' : 'ok'`)
        await page.waitUntil(`(() => {
            const button = [...document.querySelectorAll('button')].find((item) => item.getAttribute('aria-label') === 'Save game')
            return button && button.textContent.trim() === ${JSON.stringify(nextStatusLabel)} ? 'ok' : 'waiting'
        })()`)
        const libraryCalls = page.requestsSince(libraryMark)
            .filter((item) => item.method === 'PUT' && item.url.includes(`/api/v1/me/library/${target.gameId}`))
        record.libraryBodies = libraryCalls.map((item) => item.body)
        const libraryBody = libraryCalls.at(-1)?.body || ''
        let libraryJson = null
        try { libraryJson = JSON.parse(libraryBody) } catch { libraryJson = null }
        if (!libraryJson || Object.keys(libraryJson).join(',') !== 'status' || libraryJson.status !== nextStatus) {
            problems.push(`library write was not status-only ${libraryBody}`)
        }
        const kept = psql(databaseUrl, `
            select status || '|' || coalesce(hours_played::text, '') || '|' || coalesce(play_count::text, '') || '|' || coalesce(completed_all_achievements::text, '')
            from library_entries
            where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
        `, ['-tA'])
        record.libraryAfterStatus = kept
        const [keptStatus, keptHours, keptPlays, keptComplete] = (kept || '').split('|')
        if (keptStatus !== nextStatus || Number(keptHours) !== 12.5 || keptPlays !== '4' || (keptComplete !== 't' && keptComplete !== 'true')) {
            problems.push(`status-only save changed library details ${kept}`)
        }
        const savedLibrary = await shot('library-saved.png', nextStatusLabel)
        const savedLabels = await page.ariaLabels()
        if (!savedLabels.includes('Hours played 12.5') || !savedLabels.includes('Times played 4') || !savedLabels.includes('100% achievements completed')) {
            problems.push('status-only save hid the library stats')
        }
        if (!savedLibrary.includes('12.5')) problems.push('status-only save hid the hours value')

        if (!wishlistName) {
            problems.push('peek has no list to add the game to')
        } else {
            await page.clickControl('Add to list')
            await page.waitForText(wishlistName)
            const listStep = await page.bodyText()
            if (listStep.includes('New list name')) problems.push('create fields showed before New list')
            const listSheetPath = join(dir, 'list-sheet.png')
            await page.screenshot(listSheetPath)
            shots['list-sheet.png'] = listSheetPath
            await page.clickLabel(`Add to ${wishlistName}`)
            await page.waitUntil(`(() => {
                const node = [...document.querySelectorAll('button, [role="button"]')].find((item) => {
                    const text = item.textContent || ''
                    return text.includes(${JSON.stringify(wishlistName)}) && text.includes('In this list')
                })
                return node ? 'ok' : 'waiting'
            })()`)
            let membership = '0'
            const membershipStarted = Date.now()
            while (Date.now() - membershipStarted < 15_000) {
                membership = psql(databaseUrl, `
                    select count(*) from list_games
                    where list_id = '${wishlistId}'::uuid and game_id = '${target.gameId}'::uuid
                `, ['-tA'])
                if (membership === '1') break
                await new Promise((resolve) => setTimeout(resolve, 200))
            }
            record.wishlistCount = Number(membership)
            if (membership !== '1') problems.push(`wishlist membership ${membership}`)
            await page.clickControl('New list')
            await page.waitForText('New list name')
            const newListPath = join(dir, 'new-list.png')
            await page.screenshot(newListPath)
            shots['new-list.png'] = newListPath
            await page.fillLabel('New list name', listName)
            await page.fillLabel('List description', 'From the phone')
            await page.waitUntil(`(() => {
                const node = [...document.querySelectorAll('button, [role="button"]')].find((item) => item.textContent.trim() === 'Create list')
                if (!node) return 'waiting'
                node.scrollIntoView({ block: 'center' })
                return 'ok'
            })()`)
            await page.clickControl('Create list')
            await page.waitForText(listName)
            const created = psql(databaseUrl, `
                select l.id::text || '|' || count(lg.game_id)::text
                from lists l
                left join list_games lg on lg.list_id = l.id and lg.game_id = '${target.gameId}'::uuid
                where l.user_id = '${target.userId}'::uuid and l.name = '${listName}'
                group by l.id
            `, ['-tA'])
            const [createdId, createdCount] = (created || '').split('|')
            createdListId = createdId || ''
            record.createdList = created
            if (!createdId || createdCount !== '1') problems.push(`created list ${created || 'missing'}`)
            const listPath = join(dir, 'list-created.png')
            await page.screenshot(listPath)
            shots['list-created.png'] = listPath
            await page.clickControl('Close')
        }

        await page.clickLabel('Rate')
        await page.waitForText('Review note')
        await page.setViewport(375, 420)
        await page.evaluate(`(() => {
            const dialog = document.querySelector('[role="dialog"]')
            const field = dialog && dialog.querySelector('[aria-label="Review note"]')
            if (!field) return 'missing'
            field.focus()
            field.scrollIntoView({ block: 'center' })
            return 'focused'
        })()`)
        try {
            await page.waitUntil(`(() => {
                const dialog = document.querySelector('[role="dialog"]')
                const field = dialog && dialog.querySelector('textarea, input')
                const labeled = dialog && dialog.querySelector('[aria-label="Review note"]')
                const target = labeled || field
                if (!target) return 'missing field'
                if (document.activeElement !== target) target.focus()
                target.scrollIntoView({ block: 'center' })
                const active = document.activeElement
                const focused = target === active || (active && target.contains(active))
                const box = target.getBoundingClientRect()
                const visible = Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0)
                if (focused && visible >= 48) return 'ok'
                const name = active ? (active.getAttribute('aria-label') || active.tagName) : 'none'
                return 'top=' + Math.round(box.top) + ' bottom=' + Math.round(box.bottom) + ' visible=' + Math.round(visible) + ' active=' + name
            })()`, 5_000)
        } catch (error) {
            problems.push(error instanceof Error ? error.message : String(error))
        }
        await page.waitForText('Close')
        const keyboardPath = join(dir, 'keyboard-open.png')
        await page.screenshot(keyboardPath)
        shots['keyboard-open.png'] = keyboardPath
        const keyboardSheet = await page.evaluate(`(() => {
            const dialog = [...document.querySelectorAll('[role="dialog"]')].find((item) => (item.innerText || '').includes('Review note'))
            if (!dialog) return ''
            const close = [...dialog.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Close')
            const box = close ? close.getBoundingClientRect() : null
            return JSON.stringify({
                text: dialog.innerText,
                closeTop: box ? box.top : null,
                closeHeight: box ? box.height : null,
                viewport: window.innerHeight,
            })
        })()`)
        record.keyboard = JSON.parse(keyboardSheet || '{}')
        if (!record.keyboard.text || !record.keyboard.text.includes('Close')) problems.push('keyboard sheet is missing Close')
        if (!record.keyboard.text.includes('Review note')) problems.push('keyboard sheet is missing Review note')
        if (record.keyboard.closeTop == null || record.keyboard.closeTop < 0 || record.keyboard.closeTop + record.keyboard.closeHeight > record.keyboard.viewport + 1) {
            problems.push(`Close is outside the keyboard viewport ${keyboardSheet}`)
        }
    } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error))
    } finally {
        if (createdListId) {
            try {
                const token = await peekAccessToken()
                const del = await fetch(`${origin}/api/v1/lists/${createdListId}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
                })
                record.listDeleteStatus = del.status
                if (del.status !== 204) problems.push(`list delete status ${del.status}`)
            } catch (error) {
                problems.push(error instanceof Error ? error.message : String(error))
            }
        }
        psql(databaseUrl, `
            delete from lists where user_id = '${target.userId}'::uuid and name = '${listName}';
            ${wishlistId ? `delete from list_games where list_id = '${wishlistId}'::uuid and game_id = '${target.gameId}'::uuid;` : ''}
        `)
        if (seededShot) {
            const restoredShots = priorShots.length
                ? `ARRAY[${priorShots.map((url) => `'${String(url).replace(/'/g, "''")}'`).join(', ')}]::text[]`
                : `'{}'::text[]`
            try {
                psql(databaseUrl, `update games set screenshots = ${restoredShots} where id = '${target.gameId}'::uuid`)
            } catch (error) {
                problems.push(error instanceof Error ? error.message : String(error))
            }
        }
        restorePeekWrites(target)
        page?.close()
        stopChrome(chromePid)
        stopExpo(expoPid)
    }

    const after = peekCounts()
    record.countsBefore = beforeCounts
    record.countsAfter = after
    if (after.ratings !== 5 || after.library !== 5) problems.push(`counts after restore ${after.ratings}/${after.library}`)
    const restored = psql(databaseUrl, `
        select rating::text || '|' || encode(convert_to(coalesce(review, ''), 'UTF8'), 'base64') || '|' || (
            select status from library_entries
            where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
        )
        from ratings_reviews
        where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
    `, ['-tA'])
    record.restored = restored
    if (restored !== `${target.rating}|${target.reviewB64}|${target.status}`) problems.push(`restore mismatch ${restored}`)
    record.problems = problems
    record.shots = shots
    await writeFile(join(dir, 'result.json'), JSON.stringify(record, null, 2))
    await writeFile(join(dir, 'postgres.txt'), [
        `slug=${target.slug}`,
        `after_rate=${record.reviewAfterRate ?? ''}`,
        `after_edit=${record.reviewAfterEdit ?? ''}`,
        `after_delete=${record.reviewAfterDelete ?? ''}`,
        `library=${record.libraryAfterStatus ?? ''}`,
        `library_body=${(record.libraryBodies || []).join(' ')}`,
        `wishlist=${record.wishlistCount ?? ''}`,
        `created=${record.createdList ?? ''}`,
        `counts_after=${after.ratings}/${after.library}`,
        `restored=${restored}`,
        '',
    ].join('\n'))
    if (problems.length) {
        console.error(problems.join('\n'))
        process.exit(1)
    }
    log(`proved mobile-game evidence ${dir}`)
}
