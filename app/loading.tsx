// Neutral fallback shown while any route without its own loading.tsx fetches.
// Data-heavy routes (games, game detail, profile, loadout, list detail) have
// their own skeletons that match their real layout.
export default function Loading() {
    return (
        <main aria-busy="true" className="w-full max-w-6xl mx-auto px-6 sm:px-8 pt-8 pb-16">
            <div className="h-9 w-56 rounded bg-(--color-surface) motion-safe:animate-pulse" />
            <div className="mt-8 space-y-4">
                <div className="h-24 rounded-md bg-(--color-surface) motion-safe:animate-pulse" />
                <div className="h-24 rounded-md bg-(--color-surface) motion-safe:animate-pulse" />
                <div className="h-24 rounded-md bg-(--color-surface) motion-safe:animate-pulse" />
            </div>
        </main>
    )
}
