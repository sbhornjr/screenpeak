// `scale` is the range `score` is on: 10 for ScreenPeak / viewer scores, 100 for
// Metacritic. Tiers are judged on the normalised 0–10 value so an 87 Metacritic
// reads amber-ish "good", not the same flat blue as a 9.
function sealColor(score: number, scale: 10 | 100) {
    const s = scale === 100 ? score / 10 : score
    return s >= 8 ? 'var(--color-good)' : s >= 6 ? 'var(--color-mid)' : 'var(--color-bad)'
}

// A HUD-style score tag that rides on a game's cover art — flat and screen-readout,
// not an ink stamp. The tier colour carries the number and a bottom hairline; the
// fill stays near-opaque dark so it holds up on bright, busy covers.
export default function Seal({ label, score, side, size = 'md', scale = 10 }: { label?: string, score: number, side: 'left' | 'right', size?: 'md' | 'sm', scale?: 10 | 100 }) {
    const color = sealColor(score, scale)
    const pad = size === 'sm' ? 'px-1.5 pt-1 pb-[3px]' : 'px-2 pt-1.5 pb-1'
    return (
        <div
            className={`absolute top-2 ${side === 'right' ? 'right-2' : 'left-2'}
                flex flex-col items-center rounded-[2px] backdrop-blur-[2px]
                shadow-[0_1px_4px_rgba(0,0,0,0.5)] ${pad}`}
            style={{
                backgroundColor: 'rgba(11,13,16,0.9)',
                border: '1px solid var(--color-border-bright)',
                borderBottom: `2px solid ${color}`,
            }}
        >
            {label && (
                <span className="text-[7px] font-semibold uppercase tracking-[0.18em] leading-none font-mono text-(--color-muted)">
                    {label}
                </span>
            )}
            <span
                className={`${label ? 'text-sm mt-1' : 'text-base'} font-bold leading-none font-mono tabular-nums`}
                style={{ color }}
            >
                {score}
            </span>
        </div>
    )
}
