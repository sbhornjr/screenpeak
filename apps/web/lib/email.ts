// Server-only: constructs a Resend client. 'server-only' turns an accidental
// import from a 'use client' file into a build error — same bundle-separation
// constraint lib/r2.ts and lib/db.ts document.
import 'server-only'
import { Resend } from 'resend'
import type { ReportInput } from '@screenpeak/shared/api/moderation'

const REPORT_INBOX = 'support@screenpeak.gg'
const REPORT_FROM = 'ScreenPeak Reports <reports@screenpeak.gg>'

function requireEnv(name: string): string {
    const value = process.env[name]
    if (!value) throw new Error(`${name} is not set`)
    return value
}

// Read at call time, not module load. This module may be imported alongside
// other server actions/routes (the same reasoning lib/r2.ts documents for
// R2_* — see r2Config there): a missing Resend key must not take down
// anything else sharing this module's import graph. sendReportEmail's whole
// contract is "never throws" — any failure (missing key, a rejected/thrown
// send, or Resend's own {error} response shape) resolves { ok: false, error }
// instead, since createReport's DB row is the durable record and a failed
// notification email must not block or roll that back (Task 6 decides
// whether/how to surface the failure).
export async function sendReportEmail(
    report: {
        reporterUsername: string
        details: string | null
        link: string
    } & Pick<ReportInput, 'targetType' | 'reason'>,
): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
        const apiKey = requireEnv('RESEND_API_KEY')
        const resend = new Resend(apiKey)

        const text = [
            `Reporter: ${report.reporterUsername}`,
            `Target type: ${report.targetType}`,
            `Reason: ${report.reason}`,
            `Details: ${report.details ?? '(none provided)'}`,
            `Link: ${report.link}`,
        ].join('\n')

        const { error } = await resend.emails.send({
            from: REPORT_FROM,
            to: [REPORT_INBOX],
            subject: `New ${report.targetType} report from ${report.reporterUsername}`,
            text,
        })

        if (error) return { ok: false, error: error.message }
        return { ok: true }
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
}
