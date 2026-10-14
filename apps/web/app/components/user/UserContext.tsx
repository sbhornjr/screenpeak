'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { User } from '@screenpeak/shared/types'
import { getProfileSummaryById, signOut as signOutQuery } from '@/lib/queries/user-auth'

type UserContextType = {
    user: User | null
    loading: boolean
    signOut: () => Promise<void>
}

const UserContext = createContext<UserContextType | null>(null)

export default function UserProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const supabase = createClient()

        // Fetch initial session
        async function loadUser() {
            const { data: { user: authUser } } = await supabase.auth.getUser()
            if (authUser) {
                const profile = await getProfileSummaryById(supabase, authUser.id)
                setUser(profile ?? null)
            } else {
                setUser(null)
            }
            setLoading(false)
        }

        loadUser()

        // Listen for auth changes (sign in, sign out, token refresh)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
            loadUser()
        })

        // Cleanup listener when component unmounts
        return () => subscription.unsubscribe()
    }, [])

    async function signOut() {
        const supabase = createClient()
        await signOutQuery(supabase)
        setUser(null)
        // Full reload so server components re-render for the signed-out session
        // (feed, profile, and auth-gated pages all change once the cookie is gone).
        window.location.reload()
    }

    return (
        <UserContext.Provider value={{ user, loading, signOut }}>
            {children}
        </UserContext.Provider>
    )
}

export function useUser() {
    const context = useContext(UserContext)
    if (!context) throw new Error('useUser must be used inside UserProvider')
    return context
}