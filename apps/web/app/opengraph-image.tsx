import { ImageResponse } from "next/og"
import { og, OG_SIZE, loadOgFonts, OgWordmark, OgScore, formatCommunity } from "@/lib/og"
import { socialBackdrop } from "@/lib/catalog/images"
import { getHeroGame } from "@/lib/queries/game"

// Site-wide default share card. Public only: the community score, never a
// viewer's rating. Pages with their own opengraph-image override it.
// Rendered at build, then refreshed hourly so it tracks the hero.
export const revalidate = 3600

export const alt = "ScreenPeak. Your games. Your take."
export const size = OG_SIZE
export const contentType = "image/png"

export default async function Image() {
    const hero = await getHeroGame()
    const backdrop = hero ? socialBackdrop(hero) : null

    return new ImageResponse(
        (
            <div style={{ width: "100%", height: "100%", display: "flex", background: og.bg }}>
                {backdrop ? (
                    <img src={backdrop.url} alt="" width={backdrop.width} height={backdrop.height} style={{ objectFit: backdrop.fit }} />
                ) : null}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: backdrop ? "56px 64px" : "72px 80px" }}>
                    <OgWordmark fontSize={backdrop ? 48 : 64} />
                    <div style={{ display: "flex", fontFamily: "Chakra Petch", fontSize: backdrop ? 56 : 72, color: og.text, lineHeight: 1.05, maxWidth: 900 }}>
                        Your games. Your take.
                    </div>
                    {hero ? (
                        <div style={{ display: "flex", flexDirection: "column", paddingTop: 28, borderTop: `1px solid ${og.border}` }}>
                            <span style={{ fontFamily: "IBM Plex Mono", fontSize: 22, letterSpacing: 3, color: og.text, marginBottom: 20 }}>
                                {hero.name.toUpperCase()}
                            </span>
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
                        <div style={{ display: "flex", paddingTop: 36, borderTop: `1px solid ${og.border}`, fontFamily: "IBM Plex Mono", fontSize: 28, color: og.muted }}>
                            Track what you play, and see how your take compares with the community.
                        </div>
                    )}
                </div>
            </div>
        ),
        { ...size, fonts: await loadOgFonts() }
    )
}
