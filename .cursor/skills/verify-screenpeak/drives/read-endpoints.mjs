// drive read-endpoints: the recipe is ../features/read-endpoints.md.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { connectChrome, launchChrome, stopChrome } from '../browser.mjs'
import { appPort, databaseUrl, evidenceRoot, peekUsername } from '../config.mjs'
import { psql } from '../database.mjs'
import { log, requireDoctor } from '../runtime.mjs'

function restorePeekPrivacy() {
    psql(databaseUrl, `
        UPDATE users
        SET library_public = true, loadout_public = true
        WHERE username = '${peekUsername}';
        DELETE FROM lists
        WHERE user_id = (SELECT id FROM users WHERE username = '${peekUsername}')
          AND name = 'Verify Private Shelf';
    `)
}

export async function driveReadEndpoints() {
    requireDoctor()
    const dir = join(evidenceRoot, 'read-endpoints')
    await mkdir(dir, { recursive: true })
    const origin = `http://127.0.0.1:${appPort}`
    const problems = []
    const record = {}

    async function getJson(path) {
        const res = await fetch(`${origin}${path}`)
        const body = await res.json().catch(() => null)
        return { status: res.status, body }
    }

    restorePeekPrivacy()
    try {
        const profile = await getJson(`/api/v1/user/${peekUsername}`)
        record.profileStatus = profile.status
        const profileText = JSON.stringify(profile.body)
        if (profile.status !== 200) problems.push(`profile status ${profile.status}`)
        if (typeof profile.body?.profile?.follower_count !== 'number') problems.push('follower_count is not a number')
        if (typeof profile.body?.profile?.following_count !== 'number') problems.push('following_count is not a number')
        if (profile.body?.viewer !== null) problems.push('profile viewer was not null')
        if (profile.body?.profile?.email != null) problems.push('profile included an email')
        if (profileText.includes('follower_id') || Array.isArray(profile.body?.followers) || Array.isArray(profile.body?.following)) {
            problems.push('profile included a follower list')
        }
        if (profile.body?.library_stats == null) problems.push('public library_stats was missing')

        const library = await getJson(`/api/v1/user/${peekUsername}/library`)
        record.libraryStatus = library.status
        const publicGame = library.body?.games?.[0]?.name ?? null
        record.publicGame = publicGame
        if (library.status !== 200 || !Array.isArray(library.body?.games) || library.body.games.length < 1) {
            problems.push(`public library status ${library.status}`)
        }
        if (JSON.stringify(library.body).includes('avg_ngplus_rating') || JSON.stringify(library.body).includes('steam_appid')) {
            problems.push('library payload includes a retired field')
        }

        psql(databaseUrl, `UPDATE users SET library_public = false WHERE username = '${peekUsername}';`)
        const hiddenLibrary = await getJson(`/api/v1/user/${peekUsername}/library`)
        record.privateLibraryStatus = hiddenLibrary.status
        const hiddenLibraryText = JSON.stringify(hiddenLibrary.body)
        if (hiddenLibrary.status !== 404) problems.push(`private library status ${hiddenLibrary.status}`)
        if (hiddenLibrary.body?.error?.message !== 'Not found.') problems.push('private library was distinguishable from a missing player')
        if (publicGame && hiddenLibraryText.includes(publicGame)) problems.push('private library leaked a game name')
        psql(databaseUrl, `UPDATE users SET library_public = true WHERE username = '${peekUsername}';`)

        const loadout = await getJson(`/api/v1/user/${peekUsername}/loadout`)
        record.loadoutStatus = loadout.status
        if (loadout.status !== 200 || typeof loadout.body?.rating_count !== 'number') problems.push(`public loadout status ${loadout.status}`)
        if (loadout.body?.viewer !== null) problems.push('loadout viewer was not null')

        psql(databaseUrl, `UPDATE users SET loadout_public = false WHERE username = '${peekUsername}';`)
        const hiddenLoadout = await getJson(`/api/v1/user/${peekUsername}/loadout`)
        record.privateLoadoutStatus = hiddenLoadout.status
        if (hiddenLoadout.status !== 404 || hiddenLoadout.body?.error?.message !== 'Not found.') {
            problems.push(`private loadout status ${hiddenLoadout.status}`)
        }
        if (JSON.stringify(hiddenLoadout.body).includes('identity') && hiddenLoadout.body?.identity) {
            problems.push('private loadout leaked identity')
        }
        psql(databaseUrl, `UPDATE users SET loadout_public = true WHERE username = '${peekUsername}';`)

        const inserted = psql(databaseUrl, `
            INSERT INTO lists (user_id, name, description, is_public, is_default)
            SELECT id, 'Verify Private Shelf', 'kept off the index', false, false
            FROM users WHERE username = '${peekUsername}'
            RETURNING id::text;
        `, ['-t', '-A'])
        const listId = inserted.split(/\s+/).find(part => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part))
        record.privateListId = listId ?? inserted
        if (!listId) problems.push('could not read the private list id')
        const lists = await getJson(`/api/v1/user/${peekUsername}/lists`)
        record.listsStatus = lists.status
        const names = Array.isArray(lists.body?.lists) ? lists.body.lists.map(row => row.name) : []
        if (lists.status !== 200) problems.push(`lists status ${lists.status}`)
        if (names.includes('Verify Private Shelf')) problems.push('private list appeared on the index')
        const detail = await getJson(`/api/v1/user/${peekUsername}/lists/${encodeURIComponent(listId)}`)
        record.privateListStatus = detail.status
        if (detail.status !== 404 || detail.body?.error?.message !== 'Not found.') {
            problems.push(`private list detail status ${detail.status}`)
        }
        if (JSON.stringify(detail.body).includes('Verify Private Shelf')) problems.push('private list detail leaked the name')

        const catalogue = await getJson('/api/v1/games')
        record.gamesStatus = catalogue.status
        const catalogueText = JSON.stringify(catalogue.body)
        if (catalogue.status !== 200 || !Array.isArray(catalogue.body?.games) || catalogue.body.games.length < 1) {
            problems.push(`games status ${catalogue.status}`)
        }
        if (catalogueText.includes('avg_ngplus_rating')) problems.push('games payload still uses avg_ngplus_rating')
        if (Array.isArray(catalogue.body?.games) && catalogue.body.games.some(game => !('avg_rating' in game))) {
            problems.push('a catalogue card is missing avg_rating')
        }

        const me = await getJson('/api/v1/me')
        record.meStatus = me.status
        if (me.status !== 200 || me.body?.user !== null) problems.push(`me status ${me.status}`)
        const settings = await getJson('/api/v1/me/settings')
        record.settingsStatus = settings.status
        if (settings.status !== 401 || settings.body?.error?.code !== 'unauthenticated') {
            problems.push(`settings status ${settings.status}`)
        }

        const chromePid = await launchChrome()
        let page = null
        try {
            page = await connectChrome()
            await page.navigate(`${origin}/user/${peekUsername}`)
            await page.waitForText('Followers')
            await page.screenshot(join(dir, 'page.png'))
            const bodyText = await page.bodyText()
            if (!bodyText.includes(peekUsername)) problems.push('the profile page text does not include peek')
        } finally {
            page?.close()
            stopChrome(chromePid)
        }
    } finally {
        restorePeekPrivacy()
    }

    const result = { feature: 'read-endpoints', ...record, problems }
    await writeFile(join(dir, 'result.json'), JSON.stringify(result, null, 2))
    if (problems.length) {
        console.error(problems.join('\n'))
        process.exit(1)
    }
    log(`proved read-endpoints evidence ${dir}`)
}
