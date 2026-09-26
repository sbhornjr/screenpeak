import Link from "next/link"
import Wordmark from "@/app/components/util/Wordmark"

const groupLabel = "mb-2 font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-(--color-muted)"
const footerLink = "inline-flex items-center whitespace-nowrap min-h-11 sm:min-h-0 sm:py-1 text-sm text-(--color-text) hover:text-(--color-accent) transition-colors duration-200"

export default function Footer() {
    return (
        <footer className="border-t border-(--color-border) bg-(--color-bg)">
            <div className="w-full max-w-6xl mx-auto px-6 py-10 flex flex-col gap-8 sm:flex-row sm:justify-between">
                <div className="flex flex-col gap-2">
                    <Link href="/" aria-label="ScreenPeak home" className="text-xl font-bold tracking-tight self-start">
                        <Wordmark />
                    </Link>
                    <p className="font-mono text-xs text-(--color-muted)">&copy; {new Date().getFullYear()} ScreenPeak</p>
                </div>

                <div className="flex flex-col gap-6 sm:flex-row sm:gap-16">
                    <nav aria-label="Legal" className="flex flex-col">
                        <p className={groupLabel}>Legal</p>
                        <Link href="/policy" className={footerLink}>Privacy Policy</Link>
                        <Link href="/terms" className={footerLink}>Terms of Service</Link>
                    </nav>
                    <div className="flex flex-col">
                        <p className={groupLabel}>Contact</p>
                        <a href="mailto:hi@screenpeak.gg" className={footerLink}>
                            <span className="text-(--color-muted) mr-1.5">Say hi</span>hi@screenpeak.gg
                        </a>
                        <a href="mailto:support@screenpeak.gg" className={footerLink}>
                            <span className="text-(--color-muted) mr-1.5">Support</span>support@screenpeak.gg
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    )
}
