/** ScreenPeak wordmark — "Screen" and "Peak" divided by a thin phosphor seam,
 *  a literal split screen. Inherits font-size and weight from its container, so
 *  callers set the scale on the wrapping element (Link, heading, etc.). */
export default function Wordmark({ className = "" }: { className?: string }) {
    return (
        <span className={`inline-flex items-stretch font-(family-name:--font-display) ${className}`}>
            <span className="text-(--color-text)">Screen</span>
            <span
                aria-hidden="true"
                className="inline-block w-[0.09em] my-[0.12em] mx-[0.18em] bg-(--color-accent)"
            />
            <span className="text-(--color-accent)">Peak</span>
        </span>
    )
}
