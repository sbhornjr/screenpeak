// Rating-tier colour for a score value (the --color-good / --color-mid /
// --color-bad tokens). `scale` is the range `score` is on: 10 for ScreenPeak
// scores. A scale of 100 normalises onto the same 0–10 tiers.
export function tierColor(score: number, scale: 10 | 100 = 10) {
    const s = scale === 100 ? score / 10 : score
    return s >= 8 ? 'var(--color-good)' : s >= 6 ? 'var(--color-mid)' : 'var(--color-bad)'
}
