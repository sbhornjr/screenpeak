import { tierColor } from '@/lib/rating-tier'

// A HUD-style score tag that rides on a game's cover art — flat and screen-readout,
// not an ink stamp. The tier colour carries the number and a bottom hairline; the
// fill stays near-opaque dark so it holds up on bright, busy covers.
export default function Seal({ label, score, side, size = 'md', scale = 10 }: { label?: string, score: number, side: 'left' | 'right', size?: 'md' | 'sm', scale?: 10 | 100 }) {
    const color = tierColor(score, scale)
    // Fixed footprint regardless of digit count — "8", "8.5" and "10" all
    // occupy the same box so a pair of tags never reflows or collides.
    const box = size === 'sm' ? 'px-1.5 pt-1 pb-[3px] min-w-[2rem]' : 'px-2 pt-1.5 pb-1 min-w-[2.6rem]'
    return (
        <div
            className={`absolute top-2 ${side === 'right' ? 'right-2' : 'left-2'}
                flex flex-col items-center rounded-[2px] backdrop-blur-[2px]
                shadow-[0_1px_4px_rgba(0,0,0,0.5)] ${box}`}
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
