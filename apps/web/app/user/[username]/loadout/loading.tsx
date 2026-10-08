// Matches the loadout page: header + stat line, Read-out / scoring-chart grid,
// then the favorite-genres / favorite-developers / top-scores card sections.
export default function Loading() {
    return (
        <main aria-busy="true" className="bg-(--color-bg)">
            <div className="w-full max-w-6xl mx-auto px-6 md:px-10 pt-8 pb-16">
                <div className="mb-8 space-y-2 motion-safe:animate-pulse">
                    <div className="h-3 w-24 rounded bg-(--color-surface)" />
                    <div className="h-10 w-72 rounded bg-(--color-surface)" />
                    <div className="h-4 w-64 rounded bg-(--color-surface)" />
                </div>
                <div className="grid md:grid-cols-[1.4fr_1fr] gap-8 md:gap-12 mb-14">
                    <div className="h-52 rounded-md bg-(--color-surface) motion-safe:animate-pulse" />
                    <div className="h-52 rounded-md bg-(--color-surface) motion-safe:animate-pulse" />
                </div>
                <div className="h-6 w-40 rounded bg-(--color-surface) mb-4 motion-safe:animate-pulse" />
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-14">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-28 rounded-md bg-(--color-surface) motion-safe:animate-pulse" />
                    ))}
                </div>
                <div className="h-6 w-40 rounded bg-(--color-surface) mb-4 motion-safe:animate-pulse" />
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="aspect-3/4 rounded-[3px] bg-(--color-surface) motion-safe:animate-pulse" />
                    ))}
                </div>
            </div>
        </main>
    )
}
