// drive game-writes: the recipe is ../features/game-writes.md.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { connectChrome, launchChrome, stopChrome } from '../browser.mjs'
import { appPort, databaseUrl, evidenceRoot } from '../config.mjs'
import { psql } from '../database.mjs'
import { assertUuid, peekAccessToken, peekCounts, peekWriteTarget, restorePeekWrites } from '../fixtures.mjs'
import { log, requireDoctor } from '../runtime.mjs'

export async function driveGameWrites() {
    requireDoctor()
    const target = peekWriteTarget()
    const beforeCounts = peekCounts()
    const dir = join(evidenceRoot, 'game-writes')
    await mkdir(dir, { recursive: true })
    const origin = `http://127.0.0.1:${appPort}`
    const problems = []
    const record = {
        feature: 'game-writes',
        slug: target.slug,
        name: target.name,
        gameId: target.gameId,
        countsBefore: beforeCounts,
    }
    const nextStatus = target.status === 'playing' ? 'backlog' : 'playing'
    const marker = 'verify-screenpeak write'
    let token = ''
    let createdListId = ''
    try {
        token = await peekAccessToken()
        const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }

        const denied = await fetch(`${origin}/api/v1/games/${target.gameId}/review`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ rating: target.rating, review: marker }),
        })
        const deniedBody = await denied.json().catch(() => null)
        record.noTokenStatus = denied.status
        record.noTokenCode = deniedBody?.error?.code ?? null
        if (denied.status !== 401 || deniedBody?.error?.code !== 'unauthenticated') {
            problems.push(`missing bearer status ${denied.status} ${deniedBody?.error?.code}`)
        }

        const cookieOnly = await fetch(`${origin}/api/v1/games/${target.gameId}/review`, {
            method: 'PUT',
            headers: {
                Cookie: 'sb-access-token=website-session',
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({ rating: target.rating, review: marker }),
        })
        const cookieBody = await cookieOnly.json().catch(() => null)
        record.cookieOnlyStatus = cookieOnly.status
        record.cookieOnlyCode = cookieBody?.error?.code ?? null
        if (cookieOnly.status !== 401 || cookieBody?.error?.code !== 'unauthenticated') {
            problems.push(`cookie-only status ${cookieOnly.status} ${cookieBody?.error?.code}`)
        }

        const reviewRes = await fetch(`${origin}/api/v1/games/${target.gameId}/review`, {
            method: 'PUT',
            headers: auth,
            body: JSON.stringify({ rating: target.rating, review: marker }),
        })
        const reviewBody = await reviewRes.json().catch(() => null)
        record.reviewStatus = reviewRes.status
        if (reviewRes.status !== 200) problems.push(`review status ${reviewRes.status}`)
        if (reviewBody?.review !== marker) problems.push(`review body ${reviewBody?.review}`)
        if (reviewBody?.user_id !== target.userId) problems.push('review user_id was not peek')
        const reviewRow = psql(databaseUrl, `
            select review from ratings_reviews
            where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
        `, ['-tA'])
        record.reviewInPostgres = reviewRow
        if (reviewRow !== marker) problems.push(`postgres review ${reviewRow}`)

        psql(databaseUrl, `
            update library_entries
            set hours_played = 12.5, play_count = 4, completed_all_achievements = true
            where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
        `)
        const libraryRes = await fetch(`${origin}/api/v1/me/library/${target.gameId}`, {
            method: 'PUT',
            headers: auth,
            body: JSON.stringify({ status: nextStatus }),
        })
        const libraryBody = await libraryRes.json().catch(() => null)
        record.libraryStatus = libraryRes.status
        record.libraryBodyStatus = libraryBody?.status ?? null
        if (libraryRes.status !== 200 || libraryBody?.status !== nextStatus) {
            problems.push(`library status ${libraryRes.status} ${libraryBody?.status}`)
        }
        const libraryRow = psql(databaseUrl, `
            select status from library_entries
            where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
        `, ['-tA'])
        record.libraryInPostgres = libraryRow
        if (libraryRow !== nextStatus) problems.push(`postgres library ${libraryRow}`)
        const kept = psql(databaseUrl, `
            select coalesce(hours_played::text, '') || '|' || coalesce(play_count::text, '') || '|' || coalesce(completed_all_achievements::text, '')
            from library_entries
            where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
        `, ['-tA'])
        record.libraryDetailsKept = kept
        const [keptHours, keptPlays, keptComplete] = (kept || '').split('|')
        if (Number(keptHours) !== 12.5 || keptPlays !== '4' || (keptComplete !== 't' && keptComplete !== 'true')) {
            problems.push(`status-only save changed library details ${kept}`)
        }

        const listRes = await fetch(`${origin}/api/v1/lists`, {
            method: 'POST',
            headers: auth,
            body: JSON.stringify({
                name: 'Verify Write Shelf',
                description: 'harness',
                isPublic: false,
                isPinned: false,
                gameId: target.gameId,
            }),
        })
        const listBody = await listRes.json().catch(() => null)
        record.listStatus = listRes.status
        record.listId = listBody?.id ?? null
        createdListId = listBody?.id ?? ''
        if (listRes.status !== 201 || !listBody?.id) problems.push(`list status ${listRes.status}`)
        else assertUuid(listBody.id, 'listId')
        if (listBody?.id) {
            const membership = psql(databaseUrl, `
                select count(*) from list_games
                where list_id = '${listBody.id}'::uuid and game_id = '${target.gameId}'::uuid
            `, ['-tA'])
            record.listGameCount = Number(membership)
            if (membership !== '1') problems.push(`list_games count ${membership}`)
        }

        const self = await fetch(`${origin}/api/v1/user/${target.userId}/follow`, {
            method: 'POST',
            headers: auth,
        })
        const selfBody = await self.json().catch(() => null)
        record.selfFollowStatus = self.status
        if (self.status !== 400 || selfBody?.error?.message !== 'You cannot follow yourself.') {
            problems.push(`self-follow status ${self.status}`)
        }

        const during = peekCounts()
        record.countsDuring = during
        if (during.ratings !== beforeCounts.ratings || during.library !== beforeCounts.library) {
            problems.push(`counts changed during writes ${during.ratings}/${during.library}`)
        }
    } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error))
    } finally {
        if (createdListId && token) {
            try {
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
        restorePeekWrites(target)
        if (record.listDeleteStatus !== 204) {
            psql(databaseUrl, `
                delete from lists
                where user_id = '${target.userId}'::uuid and name = 'Verify Write Shelf';
            `)
        }
    }

    const after = peekCounts()
    record.countsAfter = after
    if (after.ratings !== 5 || after.library !== 5) problems.push(`counts after restore ${after.ratings}/${after.library}`)
    const leftover = psql(databaseUrl, `
        select count(*) from lists
        where user_id = '${target.userId}'::uuid and name = 'Verify Write Shelf'
    `, ['-tA'])
    record.leftoverLists = Number(leftover)
    if (leftover !== '0') problems.push('Verify Write Shelf was not deleted')
    const restoredReview = psql(databaseUrl, `
        select rating::text || '|' || encode(convert_to(coalesce(review, ''), 'UTF8'), 'base64') || '|' || (
            select status from library_entries
            where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
        )
        from ratings_reviews
        where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid
    `, ['-tA'])
    record.restored = restoredReview
    if (restoredReview !== `${target.rating}|${target.reviewB64}|${target.status}`) {
        problems.push(`restore mismatch ${restoredReview}`)
    }

    const chromePid = await launchChrome()
    let page = null
    try {
        page = await connectChrome()
        await page.navigate(`${origin}/games/${encodeURIComponent(target.slug)}`)
        await page.waitForText(target.name)
        await page.screenshot(join(dir, 'page.png'))
        const bodyText = await page.bodyText()
        if (!bodyText.includes(target.name)) problems.push('the page text does not include the game name')
    } finally {
        page?.close()
        stopChrome(chromePid)
    }

    record.problems = problems
    await writeFile(join(dir, 'result.json'), JSON.stringify(record, null, 2))
    await writeFile(join(dir, 'postgres.txt'), [
        `slug=${target.slug}`,
        `review_during=${record.reviewInPostgres ?? ''}`,
        `library_during=${record.libraryInPostgres ?? ''}`,
        `list_games=${record.listGameCount ?? ''}`,
        `counts_before=${beforeCounts.ratings}/${beforeCounts.library}`,
        `counts_after=${after.ratings}/${after.library}`,
        `restored=${restoredReview}`,
        '',
    ].join('\n'))
    if (problems.length) {
        console.error(problems.join('\n'))
        process.exit(1)
    }
    log(`proved game-writes evidence ${dir}`)
}
