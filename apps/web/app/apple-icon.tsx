import { ImageResponse } from "next/og"
import { og } from "@/lib/og"

// app/icon.svg redrawn at iOS home-screen size. Square and opaque on purpose:
// iOS applies its own corner mask and fills transparency with black.
export const size = { width: 180, height: 180 }
export const contentType = "image/png"

const s = 180 / 32 // icon.svg's 32-unit grid → 180px

export default function AppleIcon() {
    const panel = { position: "absolute", top: 8 * s, width: 9 * s, height: 16 * s, borderRadius: 1.5 * s } as const
    return new ImageResponse(
        (
            <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: og.bg }}>
                <div style={{ ...panel, left: 5.5 * s, background: "#1f242b" }} />
                <div style={{ ...panel, left: 17.5 * s, background: "#2c343d" }} />
                <div style={{ position: "absolute", left: 15.1 * s, top: 6.5 * s, width: 1.8 * s, height: 19 * s, borderRadius: 0.9 * s, background: og.accent }} />
            </div>
        ),
        size
    )
}
