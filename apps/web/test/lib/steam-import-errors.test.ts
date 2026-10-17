import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
    STEAM_IMPORT_ERRORS,
    STEAM_IMPORT_HTTP,
    steamImportClientMessage,
    steamImportHttpError,
} from '@/lib/catalog/steam-import-errors'

describe('steam import error table', () => {
    it('maps every code and keeps the lease hint off the client', () => {
        expect(Object.keys(STEAM_IMPORT_HTTP).sort()).toEqual([...STEAM_IMPORT_ERRORS].sort())
        for (const code of STEAM_IMPORT_ERRORS) {
            const error = steamImportHttpError(code)
            const row = STEAM_IMPORT_HTTP[code]
            expect(error.status).toBe(row.status)
            expect(error.code).toBe(row.apiCode)
            expect(error.message).toBe(row.message)
            expect(error.message).not.toMatch(/0008|lease is not installed|Apply /)
            expect(steamImportClientMessage(code)).toBe(row.message)
            expect(steamImportClientMessage(code)).not.toMatch(/0008/)
        }
        expect(steamImportHttpError('not_linked').status).toBe(400)
        expect(steamImportHttpError('not_public').status).toBe(400)
        expect(steamImportHttpError('steam_unavailable').status).toBe(503)
        expect(steamImportHttpError('steam_unavailable').headers).toEqual({ 'Retry-After': '5' })
        expect(steamImportHttpError('matching_unavailable').status).toBe(503)
        expect(steamImportHttpError('lease_not_installed').status).toBe(500)
        expect(steamImportHttpError('lease_not_installed').message).toBe('Something went wrong.')

        const server = readFileSync(new URL('../../lib/catalog/steam-import.ts', import.meta.url), 'utf8')
        expect(server).toContain('Apply 0008_steam_import_lease')
        expect(readFileSync(new URL('../../lib/catalog/steam-import-errors.ts', import.meta.url), 'utf8')).not.toContain('0008')
    })
})
