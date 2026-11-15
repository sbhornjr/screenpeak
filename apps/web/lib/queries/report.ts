import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { reports, ratingsReviews, lists, users } from '@/db/schema'
import type { ReportInput } from '@screenpeak/shared/api/moderation'

/** Thrown by createReport when targetId doesn't exist in the table for its
 *  targetType. The route layer (Task 7) maps this to 404. */
export class ReportTargetNotFoundError extends Error {
    constructor(targetType: ReportInput['targetType'], targetId: string) {
        super(`${targetType} target not found: ${targetId}`)
        this.name = 'ReportTargetNotFoundError'
    }
}

// reports.targetId is polymorphic (review | list | profile) with no DB
// foreign key, so createReport checks existence itself against whichever
// table targetType names.
const TARGET_TABLES = {
    review: ratingsReviews,
    list: lists,
    profile: users,
} as const

/**
 * Checks the target exists in the table matching `targetType` before
 * inserting — there's deliberately no DB foreign key on reports.targetId
 * since it's polymorphic across three tables. Throws
 * ReportTargetNotFoundError when the target is missing. Any other DB error
 * rejects as-is.
 */
export async function createReport(input: { reporterId: string } & ReportInput): Promise<void> {
    const { reporterId, targetType, targetId, reason, details } = input
    const table = TARGET_TABLES[targetType]

    const rows = await db.select({ id: table.id }).from(table).where(eq(table.id, targetId)).limit(1)
    if (rows.length === 0) throw new ReportTargetNotFoundError(targetType, targetId)

    await db.insert(reports).values({ reporterId, targetType, targetId, reason, details })
}
