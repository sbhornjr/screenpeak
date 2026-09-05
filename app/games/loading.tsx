export default function Loading() {
    return (
        <main aria-busy="true" className="w-full max-w-6xl mx-auto px-6 sm:px-8 pt-8 pb-16">
            <div className="h-10 w-40 rounded bg-(--color-surface) motion-safe:animate-pulse mb-6" />
            {/* filter bar */}
            <div className="h-12 rounded-md bg-(--color-surface) motion-safe:animate-pulse mb-6" />
            {/* game grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="motion-safe:animate-pulse">
                        <div className="aspect-3/4 rounded-[3px] bg-(--color-surface)" />
                        <div className="mt-2 h-3 w-3/4 rounded bg-(--color-surface)" />
                    </div>
                ))}
            </div>
        </main>
    )
}
