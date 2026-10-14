export default function Loading() {
    return (
        <main aria-busy="true" className="w-full max-w-6xl mx-auto px-6 sm:px-8 pt-8 pb-16">
            <div className="space-y-3 mb-8 motion-safe:animate-pulse">
                <div className="h-9 w-1/2 rounded bg-(--color-surface)" />
                <div className="h-4 w-2/3 rounded bg-(--color-surface)" />
            </div>
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
