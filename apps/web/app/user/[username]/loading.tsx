// Also the fallback for the nested player pages (library, lists, ratings_reviews)
// that don't have their own loading.tsx — they share this header shape. Loadout
// and a single list have their own.
export default function Loading() {
    return (
        <main aria-busy="true" className="w-full max-w-6xl mx-auto px-6 sm:px-8 pt-8 pb-16">
            {/* avatar + name / meta */}
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 mb-4 motion-safe:animate-pulse">
                <div className="w-24 h-24 rounded-full bg-(--color-surface) shrink-0" />
                <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 rounded bg-(--color-surface)" />
                    <div className="h-7 w-48 rounded bg-(--color-surface)" />
                    <div className="h-4 w-40 rounded bg-(--color-surface)" />
                    <div className="h-4 w-56 rounded bg-(--color-surface)" />
                </div>
            </div>
            {/* section nav */}
            <div className="h-5 w-64 rounded bg-(--color-surface) mb-8 motion-safe:animate-pulse" />
            {/* stat grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-20 rounded-md bg-(--color-surface) motion-safe:animate-pulse" />
                ))}
            </div>
            {/* section head + card grid */}
            <div className="h-6 w-32 rounded bg-(--color-surface) mb-4 motion-safe:animate-pulse" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="aspect-3/4 rounded-[3px] bg-(--color-surface) motion-safe:animate-pulse" />
                ))}
            </div>
        </main>
    )
}
