"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase-browser"

// Reached only from a password-reset link: /auth/confirm verifies the recovery
// token, sets a temporary session, and redirects here. The user then sets a new
// password against that session.
export default function UpdatePasswordPage() {
    const router = useRouter()
    const [ready, setReady] = useState<boolean | null>(null)
    const [password, setPassword] = useState("")
    const [passwordAgain, setPasswordAgain] = useState("")
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)
    const [done, setDone] = useState(false)

    useEffect(() => {
        const supabase = createClient()
        supabase.auth.getSession().then(({ data }) => setReady(!!data.session))
    }, [])

    async function submit(e: React.FormEvent) {
        e.preventDefault()
        setError("")
        if (password !== passwordAgain) {
            setError("Passwords don't match")
            return
        }
        if (password.length < 6) {
            setError("Password must be at least 6 characters")
            return
        }
        setLoading(true)
        const supabase = createClient()
        const { error } = await supabase.auth.updateUser({ password })
        setLoading(false)
        if (error) {
            setError(error.message)
            return
        }
        setDone(true)
        router.refresh()
        setTimeout(() => router.push("/"), 1400)
    }

    const inputClass =
        "w-full bg-(--color-surface) text-(--color-text) placeholder:text-(--color-muted) " +
        "border border-(--color-border) rounded-[3px] px-2 py-1 focus-visible:outline-none " +
        "focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:border-(--color-accent)"

    return (
        <main className="bg-(--color-bg) min-h-[60vh]">
            <div className="mx-auto max-w-md px-6 py-16 font-(family-name:--font-body)">
                <p className="font-mono text-[0.6875rem] uppercase tracking-[0.22em] text-(--color-muted) mb-1">
                    <span className="text-(--color-accent)" aria-hidden="true">&#9656;</span> Account
                </p>
                <h1 className="text-3xl md:text-4xl text-(--color-text) font-(family-name:--font-display) mb-6">
                    Set a new password
                </h1>

                {ready === null ? (
                    <p className="text-(--color-muted)">Checking your link&hellip;</p>
                ) : ready === false ? (
                    <p className="text-(--color-text)">
                        This page only works from the reset link in your email. Request a new one from{" "}
                        <Link href="/" className="text-(--color-accent) underline">the sign-in screen</Link>.
                    </p>
                ) : done ? (
                    <p className="text-(--color-text)">Password updated. Taking you home&hellip;</p>
                ) : (
                    <form onSubmit={submit} className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-(--color-text)">New password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={inputClass}
                        />
                        <label className="text-sm font-medium text-(--color-text) mt-2">Confirm new password</label>
                        <input
                            type="password"
                            value={passwordAgain}
                            onChange={(e) => setPasswordAgain(e.target.value)}
                            className={inputClass}
                        />
                        {error && (
                            <p className="font-semibold text-(--color-bad) mt-3">{error}</p>
                        )}
                        <button
                            type="submit"
                            disabled={loading}
                            className="mt-4 self-start font-semibold py-2 px-5 rounded-[3px] bg-(--color-accent) text-(--color-bg) hover:bg-(--color-accent-hover) transition-colors duration-200 disabled:opacity-60"
                        >
                            {loading ? "Saving…" : "Update password"}
                        </button>
                    </form>
                )}
            </div>
        </main>
    )
}
