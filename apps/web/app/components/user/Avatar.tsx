import Image from "next/image"

type AvatarSize = "sm" | "md" | "lg"

const SIZE_CLASSES: Record<AvatarSize, string> = {
    sm: "w-8 h-8",
    md: "w-14 h-14",
    lg: "w-20 h-20",
}

const FALLBACK_TEXT_CLASSES: Record<AvatarSize, string> = {
    sm: "text-sm",
    md: "text-lg",
    lg: "text-2xl",
}

const IMAGE_SIZES: Record<AvatarSize, string> = {
    sm: "32px",
    md: "56px",
    lg: "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw",
}

// Muted earth tones that live inside the warm-dark palette — enough variation
// that initial-avatars are distinguishable from each other, not so much that
// they turn into rainbow identicons and fight the UI.
const TINTS = ["#5b4636", "#4a5340", "#5a4a52", "#3f4d57", "#63513a", "#4d4437", "#544033", "#425049"]

function tintFor(seed: string) {
    let h = 0
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
    return TINTS[Math.abs(h) % TINTS.length]
}

type AvatarProps = {
    src: string | null | undefined
    alt: string
    size?: AvatarSize
    // When true, a hairline ring shows around a photo too. The initial-fallback
    // always carries the ring regardless.
    bordered?: boolean
    className?: string
}

export default function Avatar({ src, alt, size = "sm", bordered = false, className = "" }: AvatarProps) {
    const ring = !src || bordered ? "border border-(--color-border)" : ""

    return (
        <div className={`${SIZE_CLASSES[size]} rounded-full relative overflow-hidden shrink-0 ${ring} ${className}`}>
            {src ? (
                <Image src={src} alt={alt} fill className="object-cover" sizes={IMAGE_SIZES[size]} />
            ) : (
                <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ backgroundColor: tintFor(alt || "?") }}
                >
                    <span className={`${FALLBACK_TEXT_CLASSES[size]} font-bold text-(--color-text) font-(family-name:--font-display) select-none`}>
                        {(alt?.[0] || "?").toUpperCase()}
                    </span>
                </div>
            )}
        </div>
    )
}
