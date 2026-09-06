import { ReactNode } from "react"

/** The tracked-uppercase label above a page title, marked with the phosphor
 *  seam — the same screen-split motif as SectionHead, one line up. */
export default function Eyebrow({ children, className = "" }: {
    children: ReactNode
    className?: string
}) {
    return (
        <p className={`flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.22em] text-(--color-muted) mb-1 ${className}`}>
            <span className="w-[2px] h-[0.8rem] bg-(--color-accent) shrink-0" aria-hidden="true" />
            {children}
        </p>
    )
}
