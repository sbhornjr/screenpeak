import { SOCIAL_PANEL } from '@/lib/catalog/images'

export const OG_CARD = { width: 1200, height: 630 } as const

const LINE_HEIGHT = 1.15
const EM_WIDTH = 0.62

/** Text column beside the 16:9 panel, or the full card when the art was dropped. */
export function shareColumn(hasImage: boolean) {
    const padX = hasImage ? 40 : 72
    const padY = hasImage ? 44 : 64
    const outer = OG_CARD.width - (hasImage ? SOCIAL_PANEL.width : 0)
    return { outer, padX, padY, width: outer - padX * 2 }
}

function chunk(word: string, maxChars: number): string[] {
    const pieces: string[] = []
    for (let i = 0; i < word.length; i += maxChars) pieces.push(word.slice(i, i + maxChars))
    return pieces
}

export function breakShareLines(text: string, maxChars: number): string[] {
    const words = text.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) return ['']
    const lines: string[] = []
    let current = ''
    for (const word of words) {
        for (const piece of word.length <= maxChars ? [word] : chunk(word, maxChars)) {
            const next = current ? `${current} ${piece}` : piece
            if (next.length <= maxChars) current = next
            else {
                if (current) lines.push(current)
                current = piece
            }
        }
    }
    if (current) lines.push(current)
    return lines
}

/** Font size and explicit lines that fit the column. Satori does not wrap a title on its own. */
export function wrapShareTitle(name: string, columnWidth: number, options?: {
    maxFont?: number
    minFont?: number
    maxHeight?: number
}): { fontSize: number; lines: string[] } {
    const maxFont = options?.maxFont ?? 56
    const minFont = options?.minFont ?? 28
    const maxHeight = options?.maxHeight ?? 280
    const fonts: number[] = []
    for (let size = maxFont; size >= minFont; size -= 4) fonts.push(size)
    if (fonts[fonts.length - 1] !== minFont) fonts.push(minFont)

    for (const fontSize of fonts) {
        const maxChars = Math.max(1, Math.floor(columnWidth / (fontSize * EM_WIDTH)))
        const lines = breakShareLines(name, maxChars)
        if (lines.length * fontSize * LINE_HEIGHT <= maxHeight) return { fontSize, lines }
    }

    const fontSize = minFont
    const maxChars = Math.max(1, Math.floor(columnWidth / (fontSize * EM_WIDTH)))
    const maxLines = Math.max(1, Math.floor(maxHeight / (fontSize * LINE_HEIGHT)))
    const lines = breakShareLines(name, maxChars).slice(0, maxLines)
    const last = lines[lines.length - 1] ?? ''
    lines[lines.length - 1] = last.length > 1 ? `${last.slice(0, last.length - 1).trimEnd()}…` : '…'
    return { fontSize, lines }
}
