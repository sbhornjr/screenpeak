'use client'

import { useState } from "react"
import AuthModal from "@/app/components/user/AuthModal"

export default function LandingCTA({ primaryLabel, className = "" }: { primaryLabel: string, className?: string }) {
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [defaultTab, setDefaultTab] = useState<"signup" | "signin">("signup")

    function handleClick(tab: "signup" | "signin") {
        setDefaultTab(tab)
        setIsModalOpen(true)
    }

    return (
        <div className={`flex items-center gap-4 ${className}`}>
            <button
                onClick={() => handleClick("signup")}
                className="px-6 py-3 rounded-[3px] text-sm font-semibold bg-(--color-accent) text-(--color-bg)
                    hover:bg-(--color-accent-hover) transition-colors duration-200 font-(family-name:--font-display)"
            >
                {primaryLabel}
            </button>
            <button
                onClick={() => handleClick("signin")}
                className="px-6 py-3 rounded-[3px] text-sm font-semibold border border-(--color-border)
                    text-(--color-muted) hover:text-(--color-text) hover:border-(--color-accent)
                    transition-colors duration-200 font-(family-name:--font-display)"
            >
                Sign In
            </button>
            {isModalOpen && (
                <AuthModal isOpen={true} defaultTab={defaultTab} onClose={() => setIsModalOpen(false)}></AuthModal>
            )}
        </div>
    )
}
