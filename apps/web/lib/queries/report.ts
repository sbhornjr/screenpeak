import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { reports, ratingsReviews, lists, users, games } from '@/db/schema'
import { getProfileById } from '@/lib/queries/user'
import { sendReportEmail } from '@/lib/email'
import type { ReportInput } from '@screenpeak/shared/api/moderation'

function siteUrl(): string {
    return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
}

/** Thrown by createReport when targetId doesn't exist in the table for its
 *  targetType. The route layer (Task 7) maps this to 404. */
export class ReportTargetNotFoundError extends Error {
    constructor(targetType: ReportInput['targetType'], targetId: string) {
        super(`${targetType} target not found: ${targetId}`)
        this.name = 'ReportTargetNotFoundError'
    }
}

/**
 * Checks the target exists before inserting — there's deliberately no DB
 * foreign key on reports.targetId since it's polymorphic across three
 * tables. Throws ReportTargetNotFoundError when the target is missing. Any
 * other DB error rejects as-is.
 *
 * Each branch also resolves the data the best-effort notification email
 * needs to link back to the target, piggybacking it onto the same
 * existence-check query rather than re-querying afterward:
 * - `review` joins to `games` for the game's slug (ratings_reviews has no
 *   direct link to a page of its own).
 * - `list` joins to `users` for the owner's username (the existence check
 *   already needed the owner id to decide public-or-owned-by-reporter).
 * - `profile` selects the username alongside the id check.
 *
 * `list` gets its own branch beyond that: a private list owned by someone
 * other than the reporter answers the same as a missing list, so the report
 * flow can't be used as an oracle to confirm a private list still exists —
 * same precedent as `likeList` in `lib/queries/list.ts`. The reporter can
 * still report their own private list.
 */
async function resolveTargetLink(
    targetType: ReportInput['targetType'],
    targetId: string,
    reporterId: string,
): Promise<string> {
    if (targetType === 'list') {
        const rows = await db.select({
            id: lists.id, isPublic: lists.isPublic, userId: lists.userId, ownerUsername: users.username,
        })
            .from(lists)
            .innerJoin(users, eq(users.id, lists.userId))
            .where(eq(lists.id, targetId))
            .limit(1)
        const row = rows[0]
        if (!row || (!row.isPublic && row.userId !== reporterId)) {
            throw new ReportTargetNotFoundError(targetType, targetId)
        }
        return `${siteUrl()}/user/${row.ownerUsername}/lists/${targetId}`
    }

    if (targetType === 'review') {
        const rows = await db.select({ gameSlug: games.slug })
            .from(ratingsReviews)
            .innerJoin(games, eq(games.id, ratingsReviews.gameId))
            .where(eq(ratingsReviews.id, targetId))
            .limit(1)
        const row = rows[0]
        if (!row) throw new ReportTargetNotFoundError(targetType, targetId)
        return `${siteUrl()}/games/${row.gameSlug}`
    }

    const rows = await db.select({ id: users.id, username: users.username })
        .from(users).where(eq(users.id, targetId)).limit(1)
    const row = rows[0]
    if (!row) throw new ReportTargetNotFoundError(targetType, targetId)
    return `${siteUrl()}/user/${row.username}`
}

/**
 * Validates and inserts the report row, then sends a best-effort
 * notification email. The email is never allowed to risk the DB row: it's
 * sent only after the insert commits, and a `{ ok: false }` result (or a
 * thrown/rejected call, though sendReportEmail's contract says it never
 * throws) is logged, never surfaced to the caller — a down email provider
 * must not make a report appear to fail when it was actually recorded.
 */
export async function createReport(input: { reporterId: string } & ReportInput): Promise<void> {
    const { reporterId, targetType, targetId, reason, details } = input

    const link = await resolveTargetLink(targetType, targetId, reporterId)

    await db.insert(reports).values({ reporterId, targetType, targetId, reason, details })

    const reporter = await getProfileById(reporterId)
    const result = await sendReportEmail({
        reporterUsername: reporter?.username ?? 'unknown',
        targetType,
        reason,
        details: details ?? null,
        link,
    })
    if (!result.ok) {
        console.error(
            `sendReportEmail failed for report (reporter=${reporterId}, target=${targetType}:${targetId}): ${result.error}`,
        )
    }
}
