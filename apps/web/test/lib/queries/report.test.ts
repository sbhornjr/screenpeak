import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'

const state = vi.hoisted(() => ({
    existsResult: [] as unknown[],
    selectFromTable: undefined as unknown,
    selectWhere: undefined as unknown,
    insertCalls: [] as { table: unknown; values: unknown }[],
}))

vi.mock('@/lib/db', () => ({
    db: {
        select: () => ({
            from: (table: unknown) => {
                state.selectFromTable = table
                return {
                    where: (where: unknown) => {
                        state.selectWhere = where
                        return { limit: async () => state.existsResult }
                    },
                }
            },
        }),
        insert: (table: unknown) => ({
            values: async (values: unknown) => {
                state.insertCalls.push({ table, values })
            },
        }),
    },
}))

import { reports, ratingsReviews, lists, users } from '@/db/schema'
import { createReport, ReportTargetNotFoundError } from '@/lib/queries/report'

const REPORTER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TARGET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const MISSING = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

beforeEach(() => {
    state.existsResult = []
    state.selectFromTable = undefined
    state.selectWhere = undefined
    state.insertCalls = []
})

describe('createReport', () => {
    it('rejects a targetId that does not exist for the given targetType', async () => {
        state.existsResult = []

        await expect(createReport({
            reporterId: REPORTER,
            targetType: 'review',
            targetId: MISSING,
            reason: 'Spam',
        })).rejects.toThrow(/not found/i)

        await expect(createReport({
            reporterId: REPORTER,
            targetType: 'review',
            targetId: MISSING,
            reason: 'Spam',
        })).rejects.toThrow(ReportTargetNotFoundError)

        expect(state.insertCalls).toHaveLength(0)
    })

    it('writes a reports row for a valid target', async () => {
        state.existsResult = [{ id: TARGET }]

        await createReport({
            reporterId: REPORTER,
            targetType: 'review',
            targetId: TARGET,
            reason: 'Spam',
            details: 'This review is spam.',
        })

        expect(state.insertCalls).toHaveLength(1)
        expect(state.insertCalls[0].table).toBe(reports)
        expect(state.insertCalls[0].values).toEqual({
            reporterId: REPORTER,
            targetType: 'review',
            targetId: TARGET,
            reason: 'Spam',
            details: 'This review is spam.',
        })
    })

    it('omits details from the insert when not provided', async () => {
        state.existsResult = [{ id: TARGET }]

        await createReport({
            reporterId: REPORTER,
            targetType: 'list',
            targetId: TARGET,
            reason: 'Spam',
        })

        expect(state.insertCalls[0].values).toEqual({
            reporterId: REPORTER,
            targetType: 'list',
            targetId: TARGET,
            reason: 'Spam',
            details: undefined,
        })
    })

    it('checks the review target against ratingsReviews', async () => {
        state.existsResult = [{ id: TARGET }]

        await createReport({ reporterId: REPORTER, targetType: 'review', targetId: TARGET, reason: 'Spam' })

        expect(state.selectFromTable).toBe(ratingsReviews)
        expect(state.selectWhere).toEqual(eq(ratingsReviews.id, TARGET))
    })

    it('checks the list target against lists', async () => {
        state.existsResult = [{ id: TARGET }]

        await createReport({ reporterId: REPORTER, targetType: 'list', targetId: TARGET, reason: 'Spam' })

        expect(state.selectFromTable).toBe(lists)
        expect(state.selectWhere).toEqual(eq(lists.id, TARGET))
    })

    it('checks the profile target against users', async () => {
        state.existsResult = [{ id: TARGET }]

        await createReport({ reporterId: REPORTER, targetType: 'profile', targetId: TARGET, reason: 'Spam' })

        expect(state.selectFromTable).toBe(users)
        expect(state.selectWhere).toEqual(eq(users.id, TARGET))
    })
})
