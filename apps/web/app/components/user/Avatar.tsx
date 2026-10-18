import Image from "next/image"
import { avatarTint } from "@screenpeak/shared/tokens"

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
                    style={{ backgroundColor: avatarTint(alt || "?") }}
                >
                    <span className={`${FALLBACK_TEXT_CLASSES[size]} font-bold text-(--color-text) font-(family-name:--font-display) select-none`}>
                        {(alt?.[0] || "?").toUpperCase()}
                    </span>
                </div>
            )}
        </div>
    )
}
