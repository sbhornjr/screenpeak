import type { Metadata } from "next"
import Eyebrow from "@/app/components/util/Eyebrow"

export const metadata: Metadata = {
    title: "Terms of Service",
    // Placeholder until the terms are written. Drop this and add /terms to
    // app/sitemap.ts once there's content.
    robots: { index: false },
}

export default function TermsPage() {
    return (
        <main className="bg-(--color-bg) min-h-screen">
            <div className="mx-auto max-w-4xl px-6 py-12 font-(family-name:--font-body)">
                <Eyebrow>Legal</Eyebrow>
            </div>
        </main>
    )
}
