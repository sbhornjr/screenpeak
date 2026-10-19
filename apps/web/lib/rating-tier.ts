import { ratingTier } from '@screenpeak/shared/tokens'

// Rating-tier colour for a score value (the --color-good / --color-mid /
// --color-bad tokens). The threshold lives in @screenpeak/shared/tokens so
// the phone app paints the same tiers. This stays a CSS variable: the web
// stylesheet is still what resolves the colour.
const tierVar = {
    good: 'var(--color-good)',
    mid: 'var(--color-mid)',
    bad: 'var(--color-bad)',
} as const

export function tierColor(score: number, scale: 10 | 100 = 10) {
    return tierVar[ratingTier(score, scale)]
}
