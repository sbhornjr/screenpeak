import "server-only"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

// Shared pieces for the generated share images (opengraph-image.tsx files) and
// the apple-icon. Satori renders these outside the browser, so CSS custom
// properties don't exist here: this palette mirrors app/globals.css by hand.
// Keep the two in sync.
export const og = {
    bg: "#101215",
    surface: "#181b20",
    border: "#313640",
    text: "#dfe3ea",
    muted: "#8b919d",
    accent: "#47c6dd",
    critic: "#e8a24e",
    community: "#9aa1ad",
} as const

export const OG_SIZE = { width: 1200, height: 630 }

// Satori only takes ttf/otf/woff, so the next/font setup in app/layout.tsx
// can't be reused. OFL-licensed copies live in assets/fonts/.
export async function loadOgFonts() {
    const dir = join(process.cwd(), "assets/fonts")
    const [display, mono] = await Promise.all([
        readFile(join(dir, "ChakraPetch-SemiBold.ttf")),
        readFile(join(dir, "IBMPlexMono-Medium.ttf")),
    ])
    return [
        { name: "Chakra Petch", data: display, weight: 600 as const, style: "normal" as const },
        { name: "IBM Plex Mono", data: mono, weight: 500 as const, style: "normal" as const },
    ]
}

/** A 0–10 community average as the card shows it: "9", "8.4". Postgres
 *  numerics can arrive as strings ("4.00"), hence the Number(). */
export function formatCommunity(avg: number | string | null | undefined) {
    const n = Number(avg)
    return n ? String(Math.round(n * 10) / 10) : "—"
}

/** "Screen | Peak" with the cyan seam, sized by `fontSize`. */
export function OgWordmark({ fontSize }: { fontSize: number }) {
    return (
        <div style={{ display: "flex", alignItems: "stretch", fontFamily: "Chakra Petch", fontSize, lineHeight: 1 }}>
            <span style={{ color: og.text }}>Screen</span>
            <div style={{ width: fontSize * 0.09, margin: `${fontSize * 0.1}px ${fontSize * 0.18}px`, background: og.accent }} />
            <span style={{ color: og.accent }}>Peak</span>
        </div>
    )
}

/** One "player" of the split-screen score compare: label, value, scale. */
export function OgScore({ label, value, scale, color }: { label: string; value: string; scale: string; color: string }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ width: 40, height: 4, background: color, marginBottom: 14 }} />
            <span style={{ fontFamily: "IBM Plex Mono", fontSize: 20, letterSpacing: 4, color: og.muted }}>{label}</span>
            <div style={{ display: "flex", alignItems: "baseline", marginTop: 8 }}>
                <span style={{ fontFamily: "Chakra Petch", fontSize: 76, color, lineHeight: 1 }}>{value}</span>
                <span style={{ fontFamily: "IBM Plex Mono", fontSize: 22, color: og.muted, marginLeft: 10 }}>{scale}</span>
            </div>
        </div>
    )
}
