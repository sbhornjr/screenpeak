import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api'
import { assertWriteOk, writeErrorText } from '@/lib/write-http'

describe('assertWriteOk', () => {
    it('maps a foreign-key violation to Unknown game without the constraint name', () => {
        const database = writeErrorText(new Error('Failed query: insert into "library_entries"', {
            cause: {
                code: '23503',
                message: 'insert or update on table "library_entries" violates foreign key constraint "library_entries_game_id_fkey"',
            },
        }))
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

    it('maps liking your own list to a request error', () => {
        expect(() => assertWriteOk('Cannot like your own list')).toThrow(ApiError)
        try {
            assertWriteOk('Cannot like your own list')
        } catch (error) {
            expect(error).toBeInstanceOf(ApiError)
            const api = error as ApiError
            expect(api.status).toBe(400)
            expect(api.code).toBe('invalid_request')
            expect(api.message).toBe("You can't like your own list.")
        }
    })

    it('maps a unique violation by its code, not by the wording', () => {
        const taken = writeErrorText(new Error('Failed query', { cause: { code: '23505', message: 'whatever Postgres says' } }))
        expect(() => assertWriteOk(taken)).toThrow('That value is already taken.')
        expect(() => assertWriteOk('a list called unique foreign key')).toThrow(Error)
        expect(() => assertWriteOk('a list called unique foreign key')).not.toThrow(ApiError)
    })

    it('keeps the original error as the cause of an unmapped failure', () => {
        const original = new Error('connection reset')
        try {
            assertWriteOk(writeErrorText(original), original)
            expect.unreachable()
        } catch (error) {
            expect(error).not.toBeInstanceOf(ApiError)
            expect((error as Error).message).toBe('connection reset')
            expect((error as Error).cause).toBe(original)
        }
    })
})
