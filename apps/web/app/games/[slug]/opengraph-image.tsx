import { ImageResponse } from "next/og"
import { og, OG_SIZE, loadOgFonts, OgWordmark, OgScore, formatCommunity } from "@/lib/og"
import { socialBackdrop } from "@/lib/catalog/images"
import { getGameBySlug } from "@/lib/queries/game"
import { getGameRatingsStats } from "@/lib/queries/review"

export const alt = "The game on ScreenPeak, with its community score"
export const size = OG_SIZE
export const contentType = "image/png"

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    const game = await getGameBySlug(slug)
    const stats = game ? await getGameRatingsStats(game.id) : null
    const count = stats?.total_ratings ?? 0
    const average = count > 0 ? stats?.avg_rating : null
    const backdrop = game ? socialBackdrop(game) : null

    const name = game?.name ?? "Game not found"

    return new ImageResponse(
        (
            <div style={{ width: "100%", height: "100%", display: "flex", background: og.bg }}>
                {backdrop ? (
                    <img
                        src={backdrop.url}
                        alt=""
                        width={backdrop.width}
                        height={backdrop.height}
                        style={{ objectFit: backdrop.fit }}
                    />
                ) : null}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "56px 64px" }}>
                    <OgWordmark fontSize={36} />
                    <div style={{ display: "flex", fontFamily: "Chakra Petch", fontSize: name.length > 28 ? 56 : 72, color: og.text, lineHeight: 1.05 }}>
                        {name}
                    </div>
                    <div style={{ display: "flex", paddingTop: 32, borderTop: `1px solid ${og.border}` }}>
                        <OgScore
                            label="COMMUNITY"
                            value={formatCommunity(average)}
                            scale={count > 0 ? `/ 10 · ${count}` : "No ratings yet"}
                            color={og.community}
                        />
                    </div>
                </div>
            </div>
        ),
        { ...size, fonts: await loadOgFonts() }
    )
}
