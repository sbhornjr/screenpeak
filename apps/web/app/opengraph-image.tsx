import { ImageResponse } from "next/og"
import { og, OG_SIZE, loadOgFonts, OgWordmark, OgScore, formatCommunity } from "@/lib/og"
import { getHeroGame } from "@/lib/queries/game"

// Site-wide default share card, featuring the same real game as the landing
// hero. Pages with their own opengraph-image (games/[slug]) override it.
// Rendered at build, then refreshed hourly so it tracks the hero.
export const revalidate = 3600

export const alt = "ScreenPeak: every game gets three scores. The critics', the community's, and yours."
export const size = OG_SIZE
export const contentType = "image/png"

export default async function Image() {
    const hero = await getHeroGame()

    return new ImageResponse(
        (
            <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: og.bg, padding: "72px 80px" }}>
                <OgWordmark fontSize={64} />
                <div style={{ display: "flex", fontFamily: "Chakra Petch", fontSize: 72, color: og.text, lineHeight: 1.05, maxWidth: 900 }}>
                    Every game gets three scores.
                </div>
                {hero ? (
                    <div style={{ display: "flex", flexDirection: "column", paddingTop: 28, borderTop: `1px solid ${og.border}` }}>
                        <span style={{ fontFamily: "IBM Plex Mono", fontSize: 22, letterSpacing: 3, color: og.text, marginBottom: 20 }}>
                            {hero.name.toUpperCase()}
                        </span>
                        <div style={{ display: "flex", gap: 48 }}>
                            <OgScore label="CRITIC" value={String(hero.metacritic_score)} scale="/ 100" color={og.critic} />
                            <OgScore label="COMMUNITY" value={formatCommunity(hero.avg_ngplus_rating)} scale="/ 10" color={og.community} />
                            <OgScore label="YOU" value="?" scale="/ 10" color={og.accent} />
                        </div>
                    </div>
                ) : (
                    // No game has enough community ratings to feature yet
                    // (HERO_MIN_RATINGS): say what the three scores are instead.
                    <div style={{ display: "flex", gap: 20, paddingTop: 36, borderTop: `1px solid ${og.border}`, fontFamily: "IBM Plex Mono", fontSize: 28, color: og.muted }}>
                        <span style={{ color: og.critic }}>The critics&apos;,</span>
                        <span style={{ color: og.community }}>the community&apos;s,</span>
                        <span style={{ color: og.accent }}>and yours.</span>
                    </div>
                )}
            </div>
        ),
        { ...size, fonts: await loadOgFonts() }
    )
}
