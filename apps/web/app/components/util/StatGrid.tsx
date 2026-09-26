import { ReactNode } from "react"

type Stat = {
    label: string
    value: ReactNode
}

export default function StatGrid({ stats, className = "" }: { stats: Stat[], className?: string }) {
    return (
        <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 mb-12 ${className}`}>
            {stats.map(({ label, value }) => (
                <div key={label} className="bg-(--color-surface) border border-(--color-border) rounded-[3px] p-5 text-center">
                    <p className="text-3xl font-mono text-(--color-text) tabular-nums">{value}</p>
                    <p className="text-[11px] uppercase tracking-[0.15em] text-(--color-muted) mt-1 font-mono">{label}</p>
                </div>
            ))}
        </div>
    )
}
