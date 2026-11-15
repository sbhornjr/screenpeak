import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'

const state = vi.hoisted(() => ({
    // One entry per expected db.select(...).limit() call, consumed in order.
    selectQueue: [] as unknown[][],
    selectCalls: [] as { table: unknown; join?: { table: unknown; on: unknown }; where: unknown }[],
    insertCalls: [] as { table: unknown; values: unknown }[],
}))

vi.mock('@/lib/db', () => ({
    db: {
        select: () => ({
            from: (table: unknown) => {
                const call: { table: unknown; join?: { table: unknown; on: unknown }; where: unknown } = {
                    table,
                    where: undefined,
                }
                state.selectCalls.push(call)
                const resolve = async () => state.selectQueue.shift() ?? []
                return {
                    where: (where: unknown) => {
                        call.where = where
                        return { limit: resolve }
                    },
                    innerJoin: (joinTable: unknown, on: unknown) => {
                        call.join = { table: joinTable, on }
                        return {
                            where: (where: unknown) => {
                                call.where = where
                                return { limit: resolve }
                            },
                        }
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

const sendReportEmail = vi.hoisted(() => vi.fn())
vi.mock('@/lib/email', () => ({ sendReportEmail }))

import { reports, ratingsReviews, lists, users, games } from '@/db/schema'
import { createReport, ReportTargetNotFoundError } from '@/lib/queries/report'

const REPORTER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TARGET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const MISSING = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

beforeEach(() => {
    state.selectQueue = []
    state.selectCalls = []
    state.insertCalls = []
    sendReportEmail.mockReset()
    sendReportEmail.mockResolvedValue({ ok: true })
})

describe('createReport', () => {
    it('rejects a targetId that does not exist for the given targetType', async () => {
        state.selectQueue = [[]]

        await expect(createReport({
            reporterId: REPORTER,
            targetType: 'review',
            targetId: MISSING,
            reason: 'Spam',
        })).rejects.toThrow(/not found/i)

        state.selectQueue = [[]]
        await expect(createReport({
            reporterId: REPORTER,
            targetType: 'review',
            targetId: MISSING,
            reason: 'Spam',
        })).rejects.toThrow(ReportTargetNotFoundError)

        expect(state.insertCalls).toHaveLength(0)
    })

    it('writes a reports row for a valid target', async () => {
        state.selectQueue = [
            [{ gameSlug: 'some-game' }],
            [{ id: REPORTER, username: 'reporterName' }],
        ]

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
        state.selectQueue = [
            [{ id: TARGET, isPublic: true, userId: 'someone-else', ownerUsername: 'someoneElse' }],
            [{ id: REPORTER, username: 'reporterName' }],
        ]

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

    it('checks the review target against ratingsReviews joined to games', async () => {
        state.selectQueue = [
            [{ gameSlug: 'some-game' }],
            [{ id: REPORTER, username: 'reporterName' }],
        ]

        await createReport({ reporterId: REPORTER, targetType: 'review', targetId: TARGET, reason: 'Spam' })

        expect(state.selectCalls[0].table).toBe(ratingsReviews)
        expect(state.selectCalls[0].join?.table).toBe(games)
        expect(state.selectCalls[0].where).toEqual(eq(ratingsReviews.id, TARGET))
    })

    it('checks the list target against lists joined to users', async () => {
        state.selectQueue = [
            [{ id: TARGET, isPublic: true, userId: 'someone-else', ownerUsername: 'someoneElse' }],
            [{ id: REPORTER, username: 'reporterName' }],
        ]

        await createReport({ reporterId: REPORTER, targetType: 'list', targetId: TARGET, reason: 'Spam' })

        expect(state.selectCalls[0].table).toBe(lists)
        expect(state.selectCalls[0].join?.table).toBe(users)
        expect(state.selectCalls[0].where).toEqual(eq(lists.id, TARGET))
    })

    it('rejects a private list belonging to someone else the same way as a missing list', async () => {
        state.selectQueue = [[{ id: TARGET, isPublic: false, userId: 'someone-else', ownerUsername: 'someoneElse' }]]

        await expect(createReport({
            reporterId: REPORTER,
            targetType: 'list',
            targetId: TARGET,
            reason: 'Spam',
        })).rejects.toThrow(ReportTargetNotFoundError)

        expect(state.insertCalls).toHaveLength(0)
    })

    it('accepts a private list belonging to the reporter themselves', async () => {
        state.selectQueue = [
            [{ id: TARGET, isPublic: false, userId: REPORTER, ownerUsername: 'reporterName' }],
            [{ id: REPORTER, username: 'reporterName' }],
        ]

        await createReport({
            reporterId: REPORTER,
            targetType: 'list',
            targetId: TARGET,
            reason: 'Spam',
        })

        expect(state.insertCalls).toHaveLength(1)
        expect(state.insertCalls[0].values).toEqual({
            reporterId: REPORTER,
            targetType: 'list',
            targetId: TARGET,
            reason: 'Spam',
            details: undefined,
        })
    })

    it('checks the profile target against users', async () => {
        state.selectQueue = [
            [{ id: TARGET, username: 'targetName' }],
            [{ id: REPORTER, username: 'reporterName' }],
        ]

        await createReport({ reporterId: REPORTER, targetType: 'profile', targetId: TARGET, reason: 'Spam' })

        expect(state.selectCalls[0].table).toBe(users)
        expect(state.selectCalls[0].where).toEqual(eq(users.id, TARGET))
    })

    describe('email side effect', () => {
        it('still records the report when the email send fails', async () => {
            state.selectQueue = [
                [{ gameSlug: 'some-game' }],
                [{ id: REPORTER, username: 'reporterName' }],
            ]
            sendReportEmail.mockResolvedValueOnce({ ok: false, error: 'network' })

            await createReport({ reporterId: REPORTER, targetType: 'review', targetId: TARGET, reason: 'Spam' })

            expect(state.insertCalls).toHaveLength(1)
        })

        it('does not throw or reject when the email send fails', async () => {
            state.selectQueue = [
                [{ gameSlug: 'some-game' }],
                [{ id: REPORTER, username: 'reporterName' }],
            ]
            sendReportEmail.mockResolvedValueOnce({ ok: false, error: 'network' })

            await expect(createReport({
                reporterId: REPORTER, targetType: 'review', targetId: TARGET, reason: 'Spam',
            })).resolves.toBeUndefined()
        })

        it('builds an absolute game-page link for a review target', async () => {
            const prevSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
            process.env.NEXT_PUBLIC_SITE_URL = 'https://screenpeak.gg'
            state.selectQueue = [
                [{ gameSlug: 'elden-ring' }],
                [{ id: REPORTER, username: 'reporterName' }],
            ]

            await createReport({ reporterId: REPORTER, targetType: 'review', targetId: TARGET, reason: 'Spam' })

            expect(sendReportEmail).toHaveBeenCalledWith(expect.objectContaining({
                link: 'https://screenpeak.gg/games/elden-ring',
                reporterUsername: 'reporterName',
                targetType: 'review',
                reason: 'Spam',
            }))
            process.env.NEXT_PUBLIC_SITE_URL = prevSiteUrl
        })

        it('builds an absolute list-page link using the owner username from the existence check', async () => {
            const prevSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
            process.env.NEXT_PUBLIC_SITE_URL = 'https://screenpeak.gg'
            state.selectQueue = [
                [{ id: TARGET, isPublic: true, userId: 'owner-id', ownerUsername: 'listOwner' }],
                [{ id: REPORTER, username: 'reporterName' }],
            ]

            await createReport({ reporterId: REPORTER, targetType: 'list', targetId: TARGET, reason: 'Spam' })

            expect(sendReportEmail).toHaveBeenCalledWith(expect.objectContaining({
                link: `https://screenpeak.gg/user/listOwner/lists/${TARGET}`,
            }))
            // Only one select call for the list branch (the existence check) — the
            // owner's username came from that same row, not a second query.
            expect(state.selectCalls).toHaveLength(2) // existence+owner join, then reporter lookup
            process.env.NEXT_PUBLIC_SITE_URL = prevSiteUrl
        })

        it('builds an absolute profile-page link for a profile target', async () => {
            const prevSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
            process.env.NEXT_PUBLIC_SITE_URL = 'https://screenpeak.gg'
            state.selectQueue = [
                [{ id: TARGET, username: 'targetName' }],
                [{ id: REPORTER, username: 'reporterName' }],
            ]

            await createReport({ reporterId: REPORTER, targetType: 'profile', targetId: TARGET, reason: 'Spam' })

            expect(sendReportEmail).toHaveBeenCalledWith(expect.objectContaining({
                link: 'https://screenpeak.gg/user/targetName',
            }))
            process.env.NEXT_PUBLIC_SITE_URL = prevSiteUrl
        })

        it('sends no email and does not throw when the target is not found', async () => {
            state.selectQueue = [[]]

            await expect(createReport({
                reporterId: REPORTER, targetType: 'profile', targetId: MISSING, reason: 'Spam',
            })).rejects.toThrow(ReportTargetNotFoundError)

            expect(sendReportEmail).not.toHaveBeenCalled()
        })
    })
})
