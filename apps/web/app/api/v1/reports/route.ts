import type { NextRequest } from 'next/server'
import type { OkResult } from '@screenpeak/shared/api/writes'
import { reportSchema } from '@screenpeak/shared/schemas'
import { ApiError, withAuth } from '@/lib/api'
import { requireBearerUser } from '@/lib/auth'
import { consumeReportRateLimit } from '@/lib/rate-limit'
import { createReport, ReportTargetNotFoundError } from '@/lib/queries/report'
import { jsonPrivate, parseBody, readJson } from '@/lib/write-http'

export const POST = withAuth(async (req: NextRequest) => {
    const user = await requireBearerUser()
    const body = parseBody(reportSchema, await readJson(req))
    // Its own budget, not consumeWriteRateLimit — 5/hour, far tighter than the
    // general write budget, and shared by nothing else.
    await consumeReportRateLimit(user.id)
    try {
        await createReport({ reporterId: user.id, ...body })
    } catch (error) {
        if (error instanceof ReportTargetNotFoundError) throw new ApiError(404, 'not_found', 'Not found.')
        throw error
    }
    return jsonPrivate({ ok: true } satisfies OkResult)
})
