function sealColor(score: number) {
    return score >= 8 ? 'var(--color-good)' : score >= 6 ? 'var(--color-mid)' : 'var(--color-bad)'
}

export default function Seal({ label, score, side, size = 'md' }: { label?: string, score: number, side: 'left' | 'right', size?: 'md' | 'sm' }) {
    const color = sealColor(score)
    const dims = size === 'sm' ? 'w-9 h-9' : 'w-11 h-11'
    return (
        <div
            className={`absolute top-2 ${side === 'right' ? 'right-2 rotate-[-7deg]' : 'left-2 rotate-[5deg]'}
                ${dims} rounded-full flex flex-col items-center justify-center gap-0
                border-2 border-dashed backdrop-blur-[2px] shadow-[0_1px_4px_rgba(0,0,0,0.5)]`}
            style={{ borderColor: color, color, backgroundColor: 'rgba(11,13,16,0.88)' }}
        >
            {label && (
                <span className="text-[7px] font-semibold uppercase tracking-[0.15em] leading-none font-mono">
                    {label}
                </span>
            )}
            <span className={`${label ? 'text-sm mt-0.5' : 'text-base'} font-semibold leading-none font-mono`}>
                {score}
            </span>
        </div>
    )
}
