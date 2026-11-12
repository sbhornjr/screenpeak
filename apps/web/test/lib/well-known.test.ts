import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const PUBLIC_DIR = join(process.cwd(), 'public/.well-known')

describe('apple-app-site-association', () => {
    const aasa = JSON.parse(readFileSync(join(PUBLIC_DIR, 'apple-app-site-association'), 'utf8'))

    it('lists one app with the ScreenPeak bundle id and the mirrored mobile routes', () => {
        const [detail] = aasa.applinks.details
        expect(detail.appID.endsWith('.com.steventpot.screenpeak')).toBe(true)
        expect(detail.paths).toEqual(['/explore', '/games', '/games/*', '/user/*'])
    })

    it('still needs the real Apple Team ID before release', () => {
        // Placeholder until Phase 5 hosting — see build-plan.md Phase 4.
        expect(aasa.applinks.details[0].appID).toMatch(/^REPLACE_WITH_APPLE_TEAM_ID\./)
    })
})

describe('assetlinks.json', () => {
    const assetlinks = JSON.parse(readFileSync(join(PUBLIC_DIR, 'assetlinks.json'), 'utf8'))

    it('targets the ScreenPeak Android package for the whole-URL permission', () => {
        const [entry] = assetlinks
        expect(entry.relation).toEqual(['delegate_permission/common.handle_all_urls'])
        expect(entry.target.namespace).toBe('android_app')
        expect(entry.target.package_name).toBe('com.steventpot.screenpeak')
    })

    it('still needs the real signing cert fingerprint before release', () => {
        // Placeholder until a signed build exists — see build-plan.md Phase 4.
        expect(assetlinks[0].target.sha256_cert_fingerprints).toEqual(['REPLACE_WITH_SHA256_CERT_FINGERPRINT'])
    })
})
