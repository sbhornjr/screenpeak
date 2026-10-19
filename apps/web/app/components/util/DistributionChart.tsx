import { tierColor } from "@/lib/rating-tier"

export default function DistributionChart({ data }: { data: { name: number, count: number }[] }) {
    const maxCount = Math.max(...data.map(d => d.count), 1)
    const total = data.reduce((sum, d) => sum + d.count, 0)

    return (
        <div className="w-full max-w-md mb-4">
            <div className="flex flex-col gap-1.5">
                {data.map(({ name, count }) => {
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0
                    return (
                        <div key={name} className="flex items-center gap-3">
                            <span className="w-5 text-right shrink-0 font-mono text-xs text-(--color-muted) tabular-nums">{name}</span>
                            <div className="flex-1 bg-(--color-surface-light) rounded-[2px] h-3.5 overflow-hidden">
                                <div
                                    className="h-full rounded-[2px] transition-[width] duration-500"
                                    style={{
                                        width: `${(count / maxCount) * 100}%`,
                                        backgroundColor: tierColor(name),
                                        minWidth: count > 0 ? '3px' : '0',
                                    }}
                                />
                            </div>
                            <span className="w-16 shrink-0 font-mono text-xs text-(--color-muted) tabular-nums">
                                {count > 0 ? `${count} · ${pct}%` : '0'}
                            </span>
                        </div>
                    )
                })}
            </div>
            <p className="mt-2 pl-8 font-mono text-[10px] uppercase tracking-[0.15em] text-(--color-muted)">
                {total} {total === 1 ? 'rating' : 'ratings'}
            </p>
        </div>
    )
}
