export default function Loading() {
    return (
        <main aria-busy="true" className="w-full max-w-6xl mx-auto px-6 sm:px-8 pt-8 pb-16">
            {/* cover + title / meta */}
            <div className="flex flex-col md:flex-row gap-8 motion-safe:animate-pulse">
                <div className="w-full max-w-[240px] aspect-3/4 rounded-[3px] bg-(--color-surface) shrink-0" />
                <div className="flex-1 space-y-4">
                    <div className="h-9 w-2/3 rounded bg-(--color-surface)" />
                    <div className="h-4 w-1/3 rounded bg-(--color-surface)" />
                    <div className="h-20 rounded-md bg-(--color-surface)" />
                    <div className="h-10 w-40 rounded bg-(--color-surface)" />
                </div>
            </div>
            {/* rating distribution */}
            <div className="mt-10 h-40 rounded-md bg-(--color-surface) motion-safe:animate-pulse" />
            {/* reviews */}
            <div className="mt-8 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-24 rounded-md bg-(--color-surface) motion-safe:animate-pulse" />
                ))}
            </div>
        </main>
    )
}
