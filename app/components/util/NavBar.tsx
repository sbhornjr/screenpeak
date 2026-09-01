'use client'

import Link from "next/link"
import { useState } from "react"
import AuthModal from "@/app/components/user/AuthModal"
import { useUser } from "@/app/components/user/UserContext"

export default function NavBar() {
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [defaultTab, setDefaultTab] = useState<"signup" | "signin">("signup")
    const [menuOpen, setMenuOpen] = useState(false)
    const { user, signOut } = useUser()

    function handleClick(tab: "signup" | "signin") {
        setIsModalOpen(true)
        setDefaultTab(tab)
        setMenuOpen(false)
    }

    // Short words, so they stay inline even on the narrowest phones — just smaller.
    const navLink = "text-lg sm:text-2xl font-bold font-(family-name:--font-display) tracking-tight hover:text-(--color-accent) transition-colors duration-200"
    const menuItem = "px-4 py-2.5 text-sm text-(--color-muted) hover:text-(--color-accent) hover:bg-(--color-surface-light) transition-colors duration-200"

    return (
        <div className="flex flex-row flex-wrap px-4 py-2 items-center gap-x-4 gap-y-1 sm:gap-x-6 w-full">
            <Link href="/" className="text-3xl sm:text-4xl font-bold font-(family-name:--font-display) tracking-tight mx-1 sm:mx-2">
                NG<span className="text-(--color-accent)">+</span>
            </Link>
            <Link href="/games" className={navLink}>
                Games
            </Link>
            <Link href="/explore" className={navLink}>
                Explore
            </Link>
            {user == null ? (
                <div className="flex items-center gap-2 sm:gap-4 ml-auto">
                    <button onClick={() => handleClick("signin")} className="inline-flex items-center min-h-11 px-2 text-sm font-semibold text-(--color-muted) hover:text-(--color-accent) transition-colors duration-200 font-(family-name:--font-display)">
                        Sign In
                    </button>
                    <button onClick={() => handleClick("signup")} className="inline-flex items-center min-h-11 px-4 rounded-[3px] text-sm font-semibold bg-(--color-accent) text-(--color-bg) hover:bg-(--color-accent-hover) transition-colors duration-200 font-(family-name:--font-display)">
                        Sign Up
                    </button>
                </div>
            ) : (
                <div className="ml-auto relative">
                    <button
                        type="button"
                        onClick={() => setMenuOpen(o => !o)}
                        aria-expanded={menuOpen}
                        aria-haspopup="menu"
                        className="flex items-center gap-1.5 min-h-11 mx-1 sm:mx-4 text-xl sm:text-2xl font-bold font-(family-name:--font-display) tracking-tight hover:text-(--color-accent) transition-colors duration-200 cursor-pointer"
                    >
                        <span className="max-w-[9rem] sm:max-w-[16rem] truncate">{user.username}</span>
                        <span className={`text-base pointer-events-none transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`} aria-hidden="true">▾</span>
                    </button>
                    {menuOpen && (
                        <>
                            {/* Tap-away backdrop — the menu opens on click, not hover, so it works on touch */}
                            <button
                                type="button"
                                aria-hidden="true"
                                tabIndex={-1}
                                onClick={() => setMenuOpen(false)}
                                className="fixed inset-0 z-40 cursor-default"
                            />
                            <div
                                role="menu"
                                className="absolute right-0 top-full mt-1 w-48 max-w-[calc(100vw-2rem)] bg-(--color-surface) border border-(--color-border) rounded-[3px]
                                    flex flex-col z-50 py-2 shadow-xl"
                            >
                                <Link href={`/user/${user.username}`} onClick={() => setMenuOpen(false)} className={menuItem}>
                                    Profile
                                </Link>
                                <Link href={`/user/${user.username}/library`} onClick={() => setMenuOpen(false)} className={menuItem}>
                                    Library
                                </Link>
                                <Link href={`/user/${user.username}/loadout`} onClick={() => setMenuOpen(false)} className={menuItem}>
                                    Loadout
                                </Link>
                                <Link href={`/user/${user.username}/lists`} onClick={() => setMenuOpen(false)} className={menuItem}>
                                    Lists
                                </Link>
                                <Link href="/settings" onClick={() => setMenuOpen(false)} className={menuItem}>
                                    Settings
                                </Link>
                                <div className="border-t border-(--color-border) mt-1 pt-1">
                                    <button
                                        onClick={() => { setMenuOpen(false); signOut() }}
                                        className="w-full text-left px-4 py-2.5 text-sm text-(--color-bad)
                                        hover:bg-(--color-surface-light) transition-colors duration-200">
                                        Sign Out
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
            {isModalOpen && (
                <AuthModal isOpen={true} defaultTab={defaultTab} onClose={() => setIsModalOpen(false)}></AuthModal>
            )}
        </div>
    )
}
