import Link from "next/link"
import { ReactNode } from "react"
import { Save } from "lucide-react"

type EmptyStateProps = {
    icon?: ReactNode
    title: string
    description?: ReactNode
    actionHref?: string
    actionLabel?: string
    /** Tighter spacing + smaller icon for use inside a page section rather than a full page. */
    dense?: boolean
}

/* Default mark: an empty save slot, "nothing written here yet". */
function DefaultIcon({ size }: { size: number }) {
    return <Save size={size} aria-hidden className="text-(--color-muted)" />
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
