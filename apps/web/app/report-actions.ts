'use server'

import { reportSchema } from '@screenpeak/shared/schemas'
import type { ReportInput } from '@screenpeak/shared/api/moderation'
import { requireUser } from '@/lib/auth'
import { consumeReportRateLimit } from '@/lib/rate-limit'
import { createReport, ReportTargetNotFoundError } from '@/lib/queries/report'

// Calls createReport (lib/queries/report.ts) directly, not the
// POST /api/v1/reports route — see AGENTS.md on web Server Actions vs API
// routes. This action has no shared withAuth wrapper, so — like toggleBlock
// in user-actions.ts — it must consume its own rate-limit budget before
// writing. It uses the tighter, dedicated report budget
// (consumeReportRateLimit), not the general write budget, matching the API
// route. See test/app/moderation-actions-rate-limit.test.ts.
//
// Schema validation runs before requireUser/the rate limiter, matching the
// pattern in app/search-actions.ts: a bad input is rejected without ever
// touching auth or spending budget.
export async function submitReport(input: ReportInput): Promise<{ error: string | null }> {
    const parsed = reportSchema.safeParse(input)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

    const user = await requireUser()
    await consumeReportRateLimit(user.id)
    try {
        await createReport({ reporterId: user.id, ...parsed.data })
    } catch (error) {
        if (error instanceof ReportTargetNotFoundError) return { error: 'Not found.' }
        throw error
    }
    return { error: null }
}
