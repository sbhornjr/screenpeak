// drive loadout-readout: the recipe is ../features/loadout-readout.md.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { connectChrome, launchChrome, stopChrome } from '../browser.mjs'
import { appPort, databaseUrl, evidenceRoot, peekEmail, peekPassword, peekUsername } from '../config.mjs'
import { psql, readLibrary } from '../database.mjs'
import { log, requireDoctor } from '../runtime.mjs'

function resetReadout() {
    psql(databaseUrl, `
        UPDATE users
        SET loadout_identity = NULL, loadout_identity_at = NULL, profile_loadout_bio = NULL
        WHERE username = '${peekUsername}';
    `)
}

function readoutRow() {
    return psql(databaseUrl, `
        select 'username=' || username
            || E'\\nloadout_identity=' || coalesce(loadout_identity, '<null>')
            || E'\\nloadout_identity_at=' || coalesce(loadout_identity_at::text, '<null>')
            || E'\\nratings=' || (select count(*) from ratings_reviews rr where rr.user_id = users.id)
            || E'\\nlibrary=' || (select count(*) from library_entries le where le.user_id = users.id)
        from users where username = '${peekUsername}';
    `, ['-tA'])
}

export async function driveLoadoutReadout() {
    requireDoctor()
    resetReadout()
    const dir = join(evidenceRoot, 'loadout-readout')
    await mkdir(dir, { recursive: true })
    const chromePid = await launchChrome()
    let page = null
    let code = 0
    try {
        page = await connectChrome()
        await page.navigate(`http://127.0.0.1:${appPort}/`)
        await page.waitForText('Sign In')
        await page.clickButton('Sign In')
        await page.waitForText('Password')
        await page.fillPlaceholder('Email', peekEmail)
        await page.fillPlaceholder('Password', peekPassword)
        await page.clickDialogButton('Sign In')
        await page.waitForText(peekUsername)
        await page.clickButton(peekUsername)
        await page.clickMenuLink('Loadout')
        await page.waitForText("peek's Loadout")
        await page.waitForText('Generate your Read-out')
        await page.navigate(`http://127.0.0.1:${appPort}/user/${peekUsername}/loadout`)
        const library = readLibrary()
        await page.waitForText('Generate your Read-out')
        await page.waitForText(library.marker)
        await page.screenshot(join(dir, 'before.png'))
        page.armLoadoutCapture()
        await page.clickButton('Generate your Read-out')
        await page.waitForTextEither([
            "Couldn't generate right now. Try again shortly.",
            'Regenerate',
        ], 90_000)
        await page.screenshot(join(dir, 'after.png'))
        const bodyText = await page.bodyText()
        const api = page.loadoutCapture
        const row = readoutRow()
        await writeFile(join(dir, 'postgres.txt'), row + '\n')
        const paragraph = await page.readoutParagraph()
        const anthropicSet = Boolean(process.env.ANTHROPIC_API_KEY)
        const persisted = row.includes('loadout_identity=') && !row.includes('loadout_identity=<null>')
        const result = {
            feature: 'loadout-readout',
            catalogue: library.mode,
            marker: library.marker,
            anthropicApiKey: anthropicSet ? 'set' : 'unset',
            api,
            paragraph,
            pageShowsError: bodyText.includes("Couldn't generate right now"),
            pageShowsRegenerate: bodyText.includes('Regenerate'),
            postgres: row,
            persisted,
        }
        await writeFile(join(dir, 'result.json'), JSON.stringify(result, null, 2))
        if (!anthropicSet) {
            console.error('Blocked: ANTHROPIC_API_KEY is unset. The Generate click ran. users.loadout_identity stayed null because lib/loadout.ts has no stub provider.')
            code = 2
        } else if (!persisted || !paragraph) {
            console.error('Generate finished without a persisted paragraph. See result.json.')
            code = 1
        } else if (!bodyText.includes(paragraph)) {
            console.error('The page text does not include the paragraph stored expectation.')
            code = 1
        } else {
            log(`proved loadout-readout evidence ${dir}`)
        }
    } finally {
        page?.close()
        stopChrome(chromePid)
    }
    process.exit(code)
}
