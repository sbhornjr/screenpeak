import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { avatarTint, colors, ratingTier, tierColor } from '@screenpeak/shared/tokens'
import { tierColor as webTierColor } from '@/lib/rating-tier'

// packages/shared/tokens.ts is a hand-copy of globals.css for React Native.
// This pins the two together: retune a colour in one and forget the other,
// and this fails naming the token.

const css = readFileSync(join(import.meta.dirname, '../../app/globals.css'), 'utf8')
const root = css.match(/:root\s*{([\s\S]*?)\n}/)![1]
const cssVars = Object.fromEntries(
    [...root.matchAll(/--color-([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
)

const camel = (name: string) => name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())
const hexToRgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))

// Resolve a globals.css value to what tokens.ts should hold: plain hex, a
// var(--color-x) alias, or the one color-mix() (a hex at some % opacity).
function resolve(value: string): string {
    const alias = value.match(/^var\(--color-([\w-]+)\)$/)
    if (alias) return resolve(cssVars[alias[1]])
    const mix = value.match(/^color-mix\(in srgb, var\(--color-([\w-]+)\) (\d+)%, transparent\)$/)
    if (mix) {
        const [r, g, b] = hexToRgb(resolve(cssVars[mix[1]]))
        return `rgba(${r}, ${g}, ${b}, ${Number(mix[2]) / 100})`
    }
    return value.toLowerCase()
}

describe('shared tokens mirror globals.css', () => {
    it('finds the colour tokens in globals.css', () => {
        expect(Object.keys(cssVars).length).toBeGreaterThan(10)
    })

    it.each(Object.keys(cssVars))('--color-%s matches tokens.colors', (name) => {
        const key = camel(name) as keyof typeof colors
        expect(colors, `tokens.ts is missing colors.${key}`).toHaveProperty(key)
        expect(colors[key].toLowerCase()).toBe(resolve(cssVars[name]))
    })

    it('has no colour that globals.css lacks', () => {
        const cssKeys = Object.keys(cssVars).map(camel)
        expect(Object.keys(colors).filter(k => !cssKeys.includes(k))).toEqual([])
    })
})

describe('shared tier and type match the site', () => {
    it('names the same three tiers the website paints', () => {
        expect(ratingTier(9)).toBe('good')
        expect(ratingTier(8)).toBe('good')
        expect(ratingTier(7.9)).toBe('mid')
        expect(ratingTier(6)).toBe('mid')
        expect(ratingTier(5.9)).toBe('bad')
        expect(ratingTier(80, 100)).toBe('good')
        expect(ratingTier(79, 100)).toBe('mid')
        expect(tierColor(9)).toBe('#4f86c6')
        expect(tierColor(7)).toBe('#e0a13f')
        expect(tierColor(5)).toBe('#e0574c')
    })

    it('picks the same initial tint the website avatar uses for peek', () => {
        expect(avatarTint('peek')).toBe('#3f4d57')
        expect(avatarTint('ada')).toBe('#544033')
    })
})

describe('tierColor matches the web thresholds', () => {
    // Web returns CSS vars, shared returns hex — map the var back to its token.
    const webAsHex = (score: number, scale: 10 | 100) =>
        colors[camel(webTierColor(score, scale).match(/--color-([\w-]+)/)![1]) as keyof typeof colors]

    it.each([
        [10, 10], [8, 10], [7.9, 10], [6, 10], [5.9, 10], [1, 10],
        [97, 100], [80, 100], [79, 100], [60, 100], [59, 100],
    ] as const)('score %s on /%s', (score, scale) => {
        expect(tierColor(score, scale)).toBe(webAsHex(score, scale))
    })
})
