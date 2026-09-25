import fs from "fs"
import path from "path"
import type { Metadata } from "next"
import Eyebrow from "@/app/components/util/Eyebrow"

export const metadata: Metadata = {
    title: "Privacy Policy",
}

// Termly's export assumes a light background — its own stylesheet forces the
// [data-custom-class='body'] wrapper transparent so the page behind it shows
// through, so we render it inside a light card rather than fighting the
// generator's hardcoded black/gray text colors to fit the dark app theme.
export default function PolicyPage() {
    const html = fs.readFileSync(path.join(process.cwd(), "app/policy/policy.html"), "utf-8")

    return (
        <main className="bg-(--color-bg) min-h-screen">
            <div className="mx-auto max-w-4xl px-6 py-12 font-(family-name:--font-body)">
                <Eyebrow>Legal</Eyebrow>
                <div
                    className="mt-4 rounded-md bg-white px-6 py-8 sm:px-12 sm:py-12 shadow-lg"
                    dangerouslySetInnerHTML={{ __html: html }}
                />
            </div>
        </main>
    )
}
