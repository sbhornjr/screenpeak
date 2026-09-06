import Link from "next/link"
import { ReactNode } from "react"

type EmptyStateProps = {
    icon?: ReactNode
    title: string
    description?: ReactNode
    actionHref?: string
    actionLabel?: string
    /** Tighter spacing + smaller icon for use inside a page section rather than a full page. */
    dense?: boolean
}

/* Default mark: an empty save-slot glyph — a floppy outline with a hollow label,
   reading as "slot with nothing written to it yet". SVG rather than emoji (emoji
   render inconsistently across platforms and read as placeholder art). */
function DefaultIcon({ size }: { size: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"
            className="text-(--color-muted)">
            <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h11l3.5 3.5v11A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-13Z" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 4v4h7V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <rect x="8" y="12" width="8" height="5" rx="0.75" stroke="currentColor" strokeWidth="1.5" strokeDasharray="1.5 2" />
        </svg>
    )
}

export default function EmptyState({ icon, title, description, actionHref, actionLabel, dense = false }: EmptyStateProps) {
    return (
        <div className={`flex flex-col items-center justify-center text-center ${dense ? "py-10" : "py-24"}`}>
            <span className="mb-4">
                {icon ?? <DefaultIcon size={dense ? 28 : 40} />}
            </span>
            <h2 className={`font-semibold mb-2 font-(family-name:--font-display) ${dense ? "text-lg" : "text-xl"}`}>
                {title}
            </h2>
            {description && (
                <p className="text-(--color-muted) text-sm mb-6 max-w-sm">
                    {description}
                </p>
            )}
            {actionHref && actionLabel && (
                <Link href={actionHref} className="px-5 py-2.5 rounded-[3px] text-sm font-semibold
                    bg-(--color-accent) text-(--color-bg) hover:bg-(--color-accent-hover)
                    transition-colors duration-200
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-bg)
                    font-(family-name:--font-display)"
                >
                    {actionLabel}
                </Link>
            )}
        </div>
    )
}
