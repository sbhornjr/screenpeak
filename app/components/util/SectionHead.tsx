import { ReactNode } from "react"

/** A phosphor seam into a tracked label, then a rule — the screen split. The
 *  recurring section header across the app. */
export default function SectionHead({ children, count, action, className = "" }: {
    children: ReactNode
    count?: ReactNode
    action?: ReactNode
    className?: string
}) {
    return (
        <div className={`flex items-center gap-2.5 mt-10 mb-5 font-mono text-[0.6875rem] uppercase tracking-[0.22em] text-(--color-muted) ${className}`}>
            <span className="w-[2px] h-[0.95rem] bg-(--color-accent) shrink-0" aria-hidden="true" />
            <b className="text-(--color-text) font-semibold whitespace-nowrap">{children}</b>
            {count != null && <span className="whitespace-nowrap">&middot; {count}</span>}
            {action && <span className="shrink-0">{action}</span>}
            <span className="flex-1 h-px bg-(--color-border)" />
        </div>
    )
}
