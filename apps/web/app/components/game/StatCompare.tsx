import { ReactNode } from "react"
import { panelClass } from "@/app/components/util/Panel"

/**
 * The scoreboard: You, then Community, both out of 10. You is the lit column.
 * The line under the scores only states a comparison when both numbers exist.
 */

type StatCompareProps = {
    you?: number | null
    community?: number | null
    communityCount?: number
    signedIn: boolean
}

function scoreOf(value: number | null | undefined): number | null {
    return typeof value === "number" && value > 0 ? value : null
}

function Col({ label, value, scale, color, highlight = false, testId }: {
    label: string
    value: ReactNode
    scale: string
    color: string
    highlight?: boolean
    testId: string
}) {
    return (
        <div
            data-testid={testId}
            className={`min-w-0 text-center rounded-md px-2 py-2.5 ${highlight ? "outline outline-1 outline-(--color-accent)/60" : ""}`}
            style={highlight ? {
                background: "radial-gradient(85% 100% at 50% 45%, rgba(71,198,221,0.2), rgba(71,198,221,0.04) 80%)",
                boxShadow: "0 0 22px -6px rgba(71,198,221,0.4)",
            } : undefined}
        >
            <p data-testid="score-label" className="font-mono text-[0.5625rem] uppercase tracking-[0.18em] text-(--color-muted) opacity-90">
                {highlight && <span className="inline-block w-[2px] h-[0.7em] align-middle bg-(--color-accent) mr-1.5" aria-hidden="true" />}
                {label}
                {highlight && <span className="inline-block w-[2px] h-[0.7em] align-middle bg-(--color-accent) ml-1.5" aria-hidden="true" />}
            </p>
            <span
                className="block font-(family-name:--font-display) font-semibold leading-none my-1 tabular-nums tracking-[-0.02em] text-[clamp(2rem,8vw,2.7rem)]"
                style={{ color }}
            >
                {value}
            </span>
            <span className="block font-mono text-[0.5625rem] tracking-wide text-(--color-muted) text-balance">{scale}</span>
        </div>
    )
}

export default function StatCompare({ you, community, communityCount = 0, signedIn }: StatCompareProps) {
    const youScore = scoreOf(you)
    const communityScore = scoreOf(community)
    const countProvesFirst = communityCount === 1 && youScore != null

    let gap: ReactNode = null
    if (youScore != null && communityScore != null && communityCount > 1) {
        const delta = youScore - communityScore
        const magnitude = Math.abs(delta).toFixed(1)
        if (Math.abs(delta) < 0.25) gap = <>You&apos;re <b>level</b> with the community</>
        else if (delta > 0) gap = <>You&apos;re <b>{magnitude} above</b> the community</>
        else gap = <>You&apos;re <b>{magnitude} below</b> the community</>
    } else if (countProvesFirst) {
        gap = <>You&apos;ve scored it &mdash; <b>first on the board</b></>
    } else if (youScore != null) {
        gap = null
    } else if (communityScore != null) {
        gap = signedIn ? <>Add your rating</> : <>Sign in to add your rating</>
    } else {
        gap = <>Be the first to rate it</>
    }

    return (
        <div
            className={`${panelClass} relative overflow-hidden w-full flex-1 basis-[16rem] max-w-[26rem] px-4 pt-[0.9rem] pb-[0.85rem]`}
            style={{ background: "radial-gradient(130% 120% at 50% -10%, rgba(71,198,221,0.1), transparent 55%), var(--color-surface)" }}
        >
            <div className="grid grid-cols-2 gap-3">
                <Col
                    testId="score-you"
                    label="You"
                    value={youScore ?? "—"}
                    scale={youScore != null ? "/ 10" : signedIn ? "not scored" : "sign in to rate"}
                    color="var(--color-you)"
                    highlight
                />
                <Col
                    testId="score-community"
                    label="Community"
                    value={communityScore ?? "—"}
                    scale={communityScore != null ? `/ 10 · ${communityCount}` : "No ratings yet"}
                    color="var(--color-community)"
                />
            </div>
            {gap && (
                <p data-testid="score-gap" className="mt-2 pt-2 border-t border-(--color-border) text-center font-mono text-[0.6875rem] uppercase tracking-[0.09em] text-(--color-muted) text-balance [&_b]:text-(--color-text) [&_b]:font-medium">
                    {gap}
                </p>
            )}
        </div>
    )
}
