import Link from 'next/link'

export default function NotFound() {
    return (
        <main className="mx-auto max-w-xl px-6 py-24 text-center font-(family-name:--font-body)">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-(--color-muted)">404</p>
            <h1 className="mt-2 font-(family-name:--font-display) text-4xl text-(--color-text)">
                Game Over
            </h1>
            <p className="mt-3 text-(--color-muted)">
                That page, game, or profile doesn&apos;t exist, or it was made private.
            </p>
            <Link href="/" className="mt-6 inline-block rounded-[3px] bg-(--color-accent) px-4 py-2 text-sm font-semibold text-(--color-bg)">
                Back to the feed
            </Link>
        </main>
    )
}