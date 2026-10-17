import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api'
import { assertWriteOk } from '@/lib/write-http'

describe('assertWriteOk', () => {
    it('maps a foreign-key violation to Unknown game without the constraint name', () => {
        const database = 'insert or update on table "library_entries" violates foreign key constraint "library_entries_game_id_fkey"'
        expect(() => assertWriteOk(database)).toThrow(ApiError)
        try {
            assertWriteOk(database)
        } catch (error) {
            expect(error).toBeInstanceOf(ApiError)
            const api = error as ApiError
            expect(api.status).toBe(400)
            expect(api.code).toBe('invalid_request')
            expect(api.message).toBe('Unknown game.')
            expect(api.message).not.toContain('library_entries_game_id_fkey')
        }
    })
})
