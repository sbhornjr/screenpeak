import { ImageResponse } from "next/og"
import { og, OG_SIZE, loadOgFonts, OgWordmark, OgScore, formatCommunity } from "@/lib/og"
import { resolveSocialBackdrop, type SocialBackdrop } from "@/lib/catalog/images"
import { shareColumn, wrapShareTitle } from "@/lib/og-layout"
import { getHeroGame } from "@/lib/queries/game"
import type { HeroGame } from "@/lib/hero-game"
import { logger } from "@/lib/logger"

// Site-wide default share card. Public only: the community score, never a
// viewer's rating. Pages with their own opengraph-image override it.
// Rendered at build, then refreshed hourly so it tracks the hero.
export const revalidate = 3600

export const alt = "ScreenPeak. Your games. Your take."
export const size = OG_SIZE
export const contentType = "image/png"

function card(hero: HeroGame | null, backdrop: SocialBackdrop | null) {
    const column = shareColumn(backdrop != null)
    const tagline = wrapShareTitle("Your games. Your take.", column.width, { maxFont: backdrop ? 48 : 64, maxHeight: 140 })
    const heroName = hero ? wrapShareTitle(hero.name.toUpperCase(), column.width, { maxFont: 22, minFont: 16, maxHeight: 72 }) : null
    return (
        <div style={{ width: "100%", height: "100%", display: "flex", background: og.bg, alignItems: "center" }}>
            {backdrop ? (
                <img src={backdrop.url} alt="" width={backdrop.width} height={backdrop.height} style={{ objectFit: backdrop.fit }} />
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: column.outer, height: "100%", padding: `${column.padY}px ${column.padX}px` }}>
                <OgWordmark fontSize={backdrop ? 40 : 56} />
                <div style={{ display: "flex", flexDirection: "column", width: column.width }}>
                    {tagline.lines.map((line, index) => (
                        <div key={index} style={{ display: "flex", fontFamily: "Chakra Petch", fontSize: tagline.fontSize, color: og.text, lineHeight: 1.15, width: column.width }}>
                            {line}
                        </div>
                    ))}
                </div>
                {hero && heroName ? (
                    <div style={{ display: "flex", flexDirection: "column", paddingTop: 24, borderTop: `1px solid ${og.border}`, width: column.width }}>
                        <div style={{ display: "flex", flexDirection: "column", width: column.width, marginBottom: 16 }}>
                            {heroName.lines.map((line, index) => (
                                <div key={index} style={{ display: "flex", fontFamily: "IBM Plex Mono", fontSize: heroName.fontSize, letterSpacing: 2, color: og.text, lineHeight: 1.2, width: column.width }}>
                                    {line}
                                </div>
                            ))}
                        </div>
                        <div style={{ display: "flex" }}>
                            <OgScore
                                label="COMMUNITY"
                                value={formatCommunity(hero.avg_ngplus_rating)}
                                scale={`/ 10 · ${hero.rating_count}`}
                                color={og.community}
                            />
                        </div>
                    </div>
                ) : (
                    <div style={{ display: "flex", paddingTop: 28, borderTop: `1px solid ${og.border}`, fontFamily: "IBM Plex Mono", fontSize: 24, color: og.muted, width: column.width }}>
                        Track what you play, and see how your take compares with the community.
                    </div>
                )}
            </div>
        </div>
    )
}

export default async function Image() {
    const hero = await getHeroGame()
    const backdrop = hero ? await resolveSocialBackdrop(hero) : null
    const fonts = await loadOgFonts()
    try {
        return new ImageResponse(card(hero, backdrop), { ...size, fonts })
    } catch (error) {
        if (!backdrop) throw error
        logger.warn("og", "share image backdrop was dropped", {
            error: error instanceof Error ? error.message : String(error),
        })
        return new ImageResponse(card(hero, null), { ...size, fonts })
    }
}
