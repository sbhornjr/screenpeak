import Link from "next/link"
import Image from "next/image"
import { displayCoverUrl } from "@/lib/catalog/images"

const ROTATIONS = ['-5deg', '3deg', '-2deg', '4deg', '-4deg']

// imgSizes intentionally requests more than the rendered box (which is only
// ~80/112px wide) — these covers are rotated, and an exactly-matched fetch
// looks soft once it's resampled at an angle plus scaled up slightly on hover.
const SIZES = {
    md: { wrap: 'w-20 aspect-3/4', overlap: '-2.25rem', imgSizes: '140px' },
    // lg fans sit in a fixed-width column in ListPreview: a full 5-cover fan is
    // ~336px wide (96 + 4×60), so the column reserves that and titles line up.
    lg: { wrap: 'w-24 aspect-3/4', overlap: '-2.25rem', imgSizes: '200px' },
}

function EmptyFan() {
    return (
        <div className="w-24 aspect-3/4 rounded-[3px] border-2 border-dashed border-(--color-border)
            flex items-center justify-center">
            <span className="text-(--color-muted) text-[10px] uppercase tracking-[0.15em]
                font-mono text-center px-2 leading-relaxed">
                No games<br />yet
            </span>
        </div>
    )
}

export default function CoverFan({ covers, size = 'md' }: { covers: { src: string, href?: string, alt?: string, key: string }[], size?: 'md' | 'lg' }) {
    const { wrap, overlap, imgSizes } = SIZES[size]
    const drawn = covers.flatMap(cover => {
        const src = displayCoverUrl(cover.src, size === 'lg' ? 'large' : 'small')
        return src ? [{ ...cover, src }] : []
    })
    if (drawn.length === 0) return <EmptyFan />
    return (
        <div className="flex items-center">
            {drawn.map((cover, i) => {
                const inner = (
                    <div
                        className={`relative ${wrap} rounded-[3px] overflow-hidden border-2 border-(--color-bg)
                            shadow-[0_4px_10px_rgba(0,0,0,0.4)] rotate-(--fan-rotate)
                            transition-transform duration-200 hover:rotate-0 hover:z-10 hover:scale-105`}
                        style={{ marginLeft: i === 0 ? 0 : overlap, ['--fan-rotate' as string]: ROTATIONS[i % ROTATIONS.length] }}
                    >
                        <Image src={cover.src} alt={cover.alt ?? ''} fill className="object-cover" sizes={imgSizes} />
                    </div>
                )
                return cover.href ? (
                    <Link key={cover.key} href={cover.href} className="relative block shrink-0" style={{ zIndex: drawn.length - i }}>
                        {inner}
                    </Link>
                ) : (
                    <div key={cover.key} className="relative shrink-0" style={{ zIndex: drawn.length - i }}>
                        {inner}
                    </div>
                )
            })}
        </div>
    )
}
