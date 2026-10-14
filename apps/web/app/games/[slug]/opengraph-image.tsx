import { ImageResponse } from "next/og"
import { og, OG_SIZE, loadOgFonts, OgWordmark, OgScore, formatCommunity } from "@/lib/og"
import { resolveSocialBackdrop, type SocialBackdrop } from "@/lib/catalog/images"
import { shareColumn, wrapShareTitle } from "@/lib/og-layout"
import { getGameBySlug } from "@/lib/queries/game"
import { getGameRatingsStats } from "@/lib/queries/review"
import { logger } from "@/lib/logger"

export const alt = "The game on ScreenPeak, with its community score"
export const size = OG_SIZE
export const contentType = "image/png"

function card(name: string, average: number | string | null | undefined, count: number, backdrop: SocialBackdrop | null) {
    const column = shareColumn(backdrop != null)
    const title = wrapShareTitle(name, column.width, { maxHeight: 250, maxFont: backdrop ? 52 : 64 })
    return (
        <div style={{ width: "100%", height: "100%", display: "flex", background: og.bg, alignItems: "center" }}>
            {backdrop ? (
                <img src={backdrop.url} alt="" width={backdrop.width} height={backdrop.height} style={{ objectFit: backdrop.fit }} />
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: column.outer, height: "100%", padding: `${column.padY}px ${column.padX}px` }}>
                <OgWordmark fontSize={32} />
                <div style={{ display: "flex", flexDirection: "column", width: column.width }}>
                    {title.lines.map((line, index) => (
                        <div key={index} style={{ display: "flex", fontFamily: "Chakra Petch", fontSize: title.fontSize, color: og.text, lineHeight: 1.15, width: column.width }}>
                            {line}
                        </div>
                    ))}
                </div>
                <div style={{ display: "flex", paddingTop: 24, borderTop: `1px solid ${og.border}`, width: column.width }}>
                    <OgScore
                        label="COMMUNITY"
                        value={formatCommunity(average)}
                        scale={count > 0 ? `/ 10 · ${count}` : "No ratings yet"}
                        color={og.community}
                    />
                </div>
            </div>
        </div>
    )
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    const game = await getGameBySlug(slug)
    const stats = game ? await getGameRatingsStats(game.id) : null
    const count = stats?.total_ratings ?? 0
    const average = count > 0 ? stats?.avg_rating : null
    const backdrop = game ? await resolveSocialBackdrop(game) : null
    const name = game?.name ?? "Game not found"
    const fonts = await loadOgFonts()
    const element = card(name, average, count, backdrop)
    try {
        return new ImageResponse(element, { ...size, fonts })
    } catch (error) {
        if (!backdrop) throw error
        logger.warn("og", "share image backdrop was dropped", {
            error: error instanceof Error ? error.message : String(error),
        })
        return new ImageResponse(card(name, average, count, null), { ...size, fonts })
    }
}
