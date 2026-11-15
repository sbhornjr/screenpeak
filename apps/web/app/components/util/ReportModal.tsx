'use client'

import { useId, useState, type FormEvent } from "react"
import { Flag } from "lucide-react"
import Modal from "@/app/components/util/Modal"
import { submitReport } from "@/app/report-actions"
import { REPORT_REASONS } from "@screenpeak/shared/constants"
import type { ReportInput } from "@screenpeak/shared/api/moderation"

type ReportTargetType = ReportInput["targetType"]

const TITLES: Record<ReportTargetType, string> = {
    review: "Report review",
    list: "Report list",
    profile: "Report profile",
}

const DETAILS_MAX = 2000

const field = "w-full bg-(--color-surface) text-(--color-text) placeholder:text-(--color-muted) border border-(--color-border) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:border-(--color-accent) rounded-[3px] px-3 py-2"
const label = "font-mono text-[0.625rem] uppercase tracking-[0.15em] text-(--color-muted) mb-1.5"

/**
 * Report a review, list, or profile. The reason list comes from
 * REPORT_REASONS[targetType] (it ends in "Other"); details are free text. On
 * success the form is replaced by a confirmation instead of closing.
 */
export default function ReportModal({ targetType, targetId, onClose }: {
    targetType: ReportTargetType
    targetId: string
    onClose: () => void
}) {
    const reasons = REPORT_REASONS[targetType]
    const [reason, setReason] = useState(reasons[0] ?? "")
    const [details, setDetails] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState("")
    const [done, setDone] = useState(false)
    const reasonId = useId()
    const detailsId = useId()

    async function handleSubmit(e: FormEvent) {
        e.preventDefault()
        if (submitting) return
        setSubmitting(true)
        setError("")
        try {
            const trimmed = details.trim()
            const { error: reportError } = await submitReport({
                targetType,
                targetId,
                reason,
                ...(trimmed ? { details: trimmed } : {}),
            })
            if (reportError) setError(reportError)
            else setDone(true)
        } catch {
            // Thrown by the action: signed out, rate limited, or an outage
            setError("Couldn't send this report. Try again in a moment.")
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Modal
            onClose={onClose}
            title={done ? "Reported" : TITLES[targetType]}
            titleClassName="font-semibold text-2xl mb-4 self-center font-(family-name:--font-display)"
            panelClassName="w-full max-w-md p-8"
        >
            {done ? (
                <div className="flex flex-col items-center gap-4 text-center">
                    <p className="text-(--color-text) leading-relaxed">
                        Thanks. We&apos;ll take a look.
                    </p>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-1 text-md bg-(--color-accent) text-(--color-bg) font-semibold rounded-[3px] hover:bg-(--color-accent-hover) transition-colors duration-200"
                    >
                        Done
                    </button>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col">
                        <label htmlFor={reasonId} className={label}>Reason</label>
                        <select
                            id={reasonId}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className={field}
                        >
                            {reasons.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                    <div className="flex flex-col">
                        <label htmlFor={detailsId} className={label}>Details (optional)</label>
                        <textarea
                            id={detailsId}
                            value={details}
                            onChange={(e) => setDetails(e.target.value)}
                            maxLength={DETAILS_MAX}
                            rows={4}
                            placeholder="Anything that helps us understand the problem"
                            className={`${field} resize-none`}
                        />
                    </div>
                    {error && <p role="alert" className="text-sm font-semibold text-(--color-bad)">{error}</p>}
                    <button
                        type="submit"
                        disabled={submitting || !reason}
                        className="self-start px-4 py-1 text-md bg-(--color-accent) text-(--color-bg) font-semibold rounded-[3px] hover:bg-(--color-accent-hover) transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {submitting ? "Reporting…" : "Report"}
                    </button>
                </form>
            )}
        </Modal>
    )
}

/** The flag-icon trigger every report entry point uses; owns the modal's open state. */
export function ReportButton({ targetType, targetId, className = "" }: {
    targetType: ReportTargetType
    targetId: string
    className?: string
}) {
    const [open, setOpen] = useState(false)
    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                title="Report"
                aria-label={TITLES[targetType]}
                className={`grid place-items-center size-7 rounded-[3px] text-(--color-muted) hover:text-(--color-bad) transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) ${className}`}
            >
                <Flag size={14} aria-hidden />
            </button>
            {open && <ReportModal targetType={targetType} targetId={targetId} onClose={() => setOpen(false)} />}
        </>
    )
}
