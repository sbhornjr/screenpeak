'use client'

import { useState } from "react"
import { createClient } from "@/lib/supabase-browser"
import { useRouter } from "next/navigation"
import Modal from "@/app/components/util/Modal"
import { signInWithPassword, signUpWithPassword } from "@/lib/queries/user-auth"
import { emailSchema, usernameSchema, passwordSchema, parseOrError } from "@/lib/schemas"

type AuthModalProps = {
    isOpen: boolean
    onClose: () => void
    defaultTab: 'signin' | 'signup'
}

export default function AuthModal({ isOpen, onClose, defaultTab = 'signin' }: AuthModalProps) {
    const [tab, setTab] = useState<"signin" | "signup">(defaultTab)
    const [loading, setLoading] = useState(false)
    const [email, setEmail] = useState("")
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [passwordAgain, setPasswordAgain] = useState("")
    const [error, setError] = useState("")
    const [info, setInfo] = useState("")
    const router = useRouter()

    if (!isOpen) return null;

    async function signIn() {
        setError("")
        setInfo("")
        const emailCheck = parseOrError(emailSchema, email)
        if (!emailCheck.success) {
            setError(emailCheck.error)
            return
        }
        setLoading(true)
        const supabase = createClient()
        const error = await signInWithPassword(supabase, emailCheck.data, password)
        setLoading(false)
        if (error) {
            setError(error.message)
        } else {
            onClose()
            router.refresh()
        }
    }

    async function forgotPassword() {
        setError("")
        setInfo("")
        const emailCheck = parseOrError(emailSchema, email)
        if (!emailCheck.success) {
            setError(emailCheck.error)
            return
        }
        setLoading(true)
        const supabase = createClient()
        const { error } = await supabase.auth.resetPasswordForEmail(emailCheck.data, {
            redirectTo: `${window.location.origin}/auth/confirm?next=/auth/update-password`,
        })
        setLoading(false)
        if (error) setError(error.message)
        else setInfo("If that email has an account, a reset link is on its way.")
    }

    async function signUp() {
        setError("")
        setInfo("")

        const emailCheck = parseOrError(emailSchema, email)
        if (!emailCheck.success) { setError(emailCheck.error); return }

        const usernameCheck = parseOrError(usernameSchema, username)
        if (!usernameCheck.success) { setError(usernameCheck.error); return }

        if (password !== passwordAgain) {
            setError("Passwords don't match")
            return
        }
        const passwordCheck = parseOrError(passwordSchema, password)
        if (!passwordCheck.success) { setError(passwordCheck.error); return }

        setLoading(true)
        const supabase = createClient()
        const { data, error } = await signUpWithPassword(
            supabase,
            { email: emailCheck.data, password: passwordCheck.data, username: usernameCheck.data },
            `${window.location.origin}/auth/confirm`,
        )
        setLoading(false)

        // Supabase hides "email already registered" two ways depending on the
        // Confirm-email setting: an explicit error when it's off, or a user with
        // no identities when it's on (anti-enumeration). Treat both as "sign in".
        const alreadyRegistered =
            error?.code === "user_already_exists" ||
            (!error && !!data.user && (data.user.identities?.length ?? 0) === 0)

        if (alreadyRegistered) {
            setError("That email already has an account — sign in instead.")
            setTab("signin")
            return
        }
        if (error) {
            setError(error.message)
            return
        }
        if (!data.session) {
            setInfo("Check your email for a link to finish signing up.")
            return
        }
        onClose()
        router.refresh()
    }

    return (
        <Modal
            onClose={onClose}
            title={tab == "signin" ? 'Sign In' : 'Sign Up'}
            titleClassName="text-4xl font-bold font-(family-name:--font-display) tracking-tight self-center mb-4"
        >
                {tab == "signin" ? (
                    <form onSubmit={(e) => { e.preventDefault(); signIn() }} className="flex flex-col items-start justify-center gap-2">
                        <label className="text-sm font-medium text-(--color-text) mt-2 first:mt-0">
                            Email
                        </label>
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-(--color-surface) text-(--color-text) placeholder:text-(--color-muted) border border-(--color-border) rounded-[3px] px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:border-(--color-accent)"
                        />
                        <label className="text-sm font-medium text-(--color-text) mt-2 first:mt-0">
                            Password
                        </label>
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-(--color-surface) text-(--color-text) placeholder:text-(--color-muted) border border-(--color-border) rounded-[3px] px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:border-(--color-accent)"
                        />
                        {error && (
                            <p className="self-center font-semibold text-(--color-bad) mt-4">{error}</p>
                        )}
                        {info && (
                            <p className="self-center text-sm text-(--color-muted) mt-4">{info}</p>
                        )}
                        <button type="submit" disabled={loading} className="font-semibold py-2 px-5 self-center my-4 rounded-[3px] bg-(--color-accent) text-(--color-bg) hover:bg-(--color-accent-hover) transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-surface) disabled:opacity-60">
                            {loading ? "..." : "Sign In"}</button>
                        <button type="button" onClick={forgotPassword} disabled={loading} className="text-sm underline self-center text-(--color-muted) hover:text-(--color-accent) transition-colors duration-200 disabled:opacity-60">Forgot password?</button>
                        <button type="button" onClick={() => { setTab("signup"); setError(""); setInfo("") }} className="underline self-center hover:text-(--color-accent) transition-colors duration-200">Don&apos;t have an account? Sign Up.</button>
                    </form>
                )
                : (
                    <form onSubmit={(e) => { e.preventDefault(); signUp() }} className="flex flex-col items-start justify-center gap-2">
                        <label className="text-sm font-medium text-(--color-text) mt-2 first:mt-0">
                            Email
                        </label>
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-(--color-surface) text-(--color-text) placeholder:text-(--color-muted) border border-(--color-border) rounded-[3px] px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:border-(--color-accent)"
                        />
                        <label className="text-sm font-medium text-(--color-text) mt-2 first:mt-0">
                            Username
                        </label>
                        <input
                            type="text"
                            placeholder="Username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full bg-(--color-surface) text-(--color-text) placeholder:text-(--color-muted) border border-(--color-border) rounded-[3px] px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:border-(--color-accent)"
                        />
                        <label className="text-sm font-medium text-(--color-text) mt-2 first:mt-0">
                            Password
                        </label>
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-(--color-surface) text-(--color-text) placeholder:text-(--color-muted) border border-(--color-border) rounded-[3px] px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:border-(--color-accent)"
                        />
                        <label className="text-sm font-medium text-(--color-text) mt-2 first:mt-0">
                            Confirm password
                        </label>
                        <input
                            type="password"
                            placeholder="Password"
                            value={passwordAgain}
                            onChange={(e) => setPasswordAgain(e.target.value)}
                            className="w-full bg-(--color-surface) text-(--color-text) placeholder:text-(--color-muted) border border-(--color-border) rounded-[3px] px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:border-(--color-accent)"
                        />
                        {error && (
                            <p className="self-center font-semibold text-(--color-bad) mt-4">{error}</p>
                        )}
                        {info && (
                            <p className="self-center text-sm text-(--color-muted) mt-4">{info}</p>
                        )}
                        <button type="submit" disabled={loading} className="font-semibold py-2 px-5 self-center my-4 rounded-[3px] bg-(--color-accent) text-(--color-bg) hover:bg-(--color-accent-hover) transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-surface) disabled:opacity-60">
                            {loading ? "..." : "Sign Up"}</button>
                        <button type="button" onClick={() => { setTab("signin"); setError(""); setInfo("") }} className="underline self-center hover:text-(--color-accent) transition-colors duration-200">Already have an account? Sign In.</button>
                    </form>
                )}
        </Modal>
    )

}