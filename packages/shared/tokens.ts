// ScreenPeak design tokens as plain JS — the values from apps/web/app/globals.css
// and DESIGN.md, for code that can't read CSS custom properties (React Native,
// charts, anything computing a colour in JS).
//
// globals.css stays the web's source of truth; this file mirrors it by hand.
// apps/web/test/shared/tokens.test.ts fails if a colour here drifts from the CSS,
// so retune a colour in both places. Pure data only: no React, no React Native,
// no DOM — both apps import this.

/** Every `--color-*` in globals.css, camelCased (`--color-surface-light` → `surfaceLight`). */
export const colors = {
    // Ground / surfaces — cool graphite, faint blue undertone
    bg: '#101215',
    surface: '#181b20',
    surfaceLight: '#21252b',
    border: '#313640',
    borderBright: '#495060',
    /** CSS: color-mix(in srgb, var(--color-text) 5%, transparent) — Panel's top catch-light */
    highlight: 'rgba(223, 227, 234, 0.05)',

    // The one accent — electron-beam cyan, treated as phosphor light
    accent: '#47c6dd',
    accentHover: '#6ad6e9',

    // Text
    text: '#dfe3ea',
    muted: '#8b919d',

    // Score panel — You is the accent, Community is the crowd
    community: '#9aa1ad',
    /** CSS: var(--color-accent) */
    you: '#47c6dd',

    // Rating tiers — score *values* only, never decoration
    good: '#4f86c6',
    mid: '#e0a13f',
    bad: '#e0574c',
    badHover: '#b0433a',
} as const

export type ColorToken = keyof typeof colors

/** Fixed colours used inline by specific components rather than as CSS tokens. */
export const overlays = {
    /** Seal's near-opaque fill — must hold up on bright, busy cover art (DESIGN.md §3) */
    sealFill: 'rgba(11, 13, 16, 0.9)',
    /** Library-status pill on a cover: --color-bg at 80% */
    statusFill: 'rgba(16, 18, 21, 0.8)',
} as const

/** Font families and the weights each app loads (next/font in apps/web/app/layout.tsx). */
export const fonts = {
    /** Chakra Petch — headings, card titles. Semi-condensed screen-readout face. */
    display: { family: 'Chakra Petch', weights: [400, 500, 600, 700] },
    /** IBM Plex Sans — prose: reviews, bios, descriptions */
    body: { family: 'IBM Plex Sans', weights: [400, 500, 600] },
    /** IBM Plex Mono — every number, datestamps, tracked-uppercase labels */
    mono: { family: 'IBM Plex Mono', weights: [400, 500, 600] },
} as const

export type FontRole = keyof typeof fonts

/**
 * Letter-spacing in em, as the web writes it (`tracking-[0.22em]`). React Native
 * wants absolute points — convert with `trackingPx(tracking.label, fontSize)`.
 */
export const tracking = {
    /** Eyebrow — tracked-uppercase mono page label */
    label: 0.22,
    /** SectionHead / Seal source label / "No Cover" */
    wide: 0.2,
    seal: 0.18,
    /** Tailwind `tracking-wider` — status pills */
    wider: 0.05,
    /** Tailwind `tracking-tight` */
    tight: -0.025,
    /** Display headings */
    display: -0.02,
} as const

export function trackingPx(em: number, fontSize: number): number {
    return Math.round(em * fontSize * 100) / 100
}

/**
 * Corner radii in px. One flat radius everywhere non-circular (DESIGN.md §5):
 * `base` (3px). `seal` is the rating tag, `bar` is distribution-bar fills.
 */
export const radius = {
    none: 0,
    bar: 1,
    seal: 2,
    base: 3,
    full: 9999,
} as const

/** Tailwind's 4px spacing scale, keyed by the class step (`p-2.5` → space[2.5] = 10). */
export const space = {
    0: 0,
    0.5: 2,
    1: 4,
    1.5: 6,
    2: 8,
    2.5: 10,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    8: 32,
    10: 40,
    12: 48,
    16: 64,
} as const

/** The Seam — the 2px vertical cyan bar before every Eyebrow/SectionHead (DESIGN.md §6). */
export const seam = {
    width: 2,
    color: colors.accent,
} as const

/**
 * A `#rrggbb` token at partial opacity — the JS equivalent of Tailwind's
 * `border-(--color-muted)/30` (→ `alpha(colors.muted, 0.3)`).
 */
export function alpha(hex: string, opacity: number): string {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
    return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

/**
 * Rating-tier colour for a score. `scale` is the range the score is on.
 * ScreenPeak scores use 10. A scale of 100 normalises onto the same 0–10
 * tiers (80 reads "good", the same as an 8).
 * Same thresholds as apps/web/lib/rating-tier.ts (which returns CSS vars instead).
 */
export function tierColor(score: number, scale: 10 | 100 = 10): string {
    const s = scale === 100 ? score / 10 : score
    return s >= 8 ? colors.good : s >= 6 ? colors.mid : colors.bad
}
