import type { Metadata } from "next"
import { redirect } from "next/navigation"
import AvatarUploader from "../components/user/AvatarUploader"
import ChangeUsernameButton from "../components/settings/ChangeUsernameButton"
import ChangeEmailButton from "../components/settings/ChangeEmailButton"
import ChangePasswordButton from "../components/settings/ChangePasswordButton"
import DeleteAccountButton from "../components/settings/DeleteUserButton"
import ChangePrivacyButton from "../components/settings/ChangePrivacyButton"
import { getOptionalUser } from "@/lib/auth"
import { loadSettings } from "@/lib/loaders/me"
import { getBlockedUsers } from "@/lib/queries/user"
import Avatar from "../components/user/Avatar"
import UnblockUserButton from "../components/settings/UnblockUserButton"
import UnlinkSteamAccountButton from "../components/settings/UnlinkSteamAccountButton"
import Link from "next/link"
import Eyebrow from "@/app/components/util/Eyebrow"

type SettingsPageProps = {
    searchParams: Promise<{ steam_error?: string }>
}

export const metadata: Metadata = {
    title: "Settings",
    robots: { index: false },
}

export default async function Settings({ searchParams } : SettingsPageProps) {
    const { steam_error } = await searchParams
    const viewer = await getOptionalUser()

    if (!viewer) redirect("/")

    // Blocked users stay out of SettingsData: that type is also the phone's
    // /api/v1/me/settings contract, and the phone has GET /api/v1/me/blocked.
    const [user, blockedUsers] = await Promise.all([
        loadSettings({ id: viewer.id, email: viewer.email }),
        getBlockedUsers(viewer.id),
    ])

    if (!user) {
        redirect("/")
    }

    const steamLinked = user.steam_linked

    return (
        <main>
            <div className="w-full max-w-2xl mx-auto px-6 pt-8 pb-16 font-(family-name:--font-display)">
                <Eyebrow>System</Eyebrow>
                <h1 className="text-4xl font-bold tracking-tight mb-6">Settings</h1>
                <div className="flex gap-5 items-center mb-8">
                    <AvatarUploader username={user.username} currentAvatarUrl={user.avatar_url} />
                    <div className="flex flex-col min-w-0">
                        <h2 className="text-2xl font-semibold font-(family-name:--font-display)">{user.username}</h2>
                        <p className="text-sm font-semibold text-(--color-muted)">{user.selected_title}</p>
                        <p className="text-sm text-(--color-muted)">Member since {new Date(user.created_at ?? '').getMonth() + 1}/{new Date(user.created_at ?? '').getDate()}/{new Date(user.created_at ?? '').getFullYear()}</p>
                    </div>
                </div>

                <div className="flex flex-col gap-6">
                    {/* Account */}
                    <section className="border border-(--color-border) rounded-[3px] bg-(--color-surface) p-6">
                        <h2 className="text-xl font-semibold mb-4">Account</h2>
                        <div className="divide-y divide-(--color-border)">
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                                <p className="text-(--color-muted)">Username <span className="text-(--color-text) ml-2">{user.username}</span></p>
                                <ChangeUsernameButton currentUsername={user.username} />
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                                <p className="text-(--color-muted) min-w-0 truncate">Email <span className="text-(--color-text) ml-2">{user.email}</span></p>
                                <ChangeEmailButton currentEmail={user.email ?? ''} />
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                                <p className="text-(--color-muted)">Password <span className="text-(--color-text) ml-2">••••••••</span></p>
                                <ChangePasswordButton />
                            </div>
                        </div>
                    </section>

                    {/* Privacy */}
                    <section className="border border-(--color-border) rounded-[3px] bg-(--color-surface) p-6">
                        <h2 className="text-xl font-semibold mb-4">Privacy</h2>
                        <div className="divide-y divide-(--color-border)">
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                                <p className="text-(--color-muted)">Default list <span className="text-(--color-text) ml-2">{user.default_list_public ? "Public" : "Private"}</span></p>
                                <ChangePrivacyButton currentPrivacy={!!user.default_list_public} type="Default List" />
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                                <p className="text-(--color-muted)">Library <span className="text-(--color-text) ml-2">{user.library_public ? "Public" : "Private"}</span></p>
                                <ChangePrivacyButton currentPrivacy={!!user.library_public} type="Library" />
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                                <p className="text-(--color-muted)">Loadout <span className="text-(--color-text) ml-2">{user.loadout_public ? "Public" : "Private"}</span></p>
                                <ChangePrivacyButton currentPrivacy={!!user.loadout_public} type="Loadout" />
                            </div>
                        </div>
                    </section>

                    {/* Connections */}
                    <section className="border border-(--color-border) rounded-[3px] bg-(--color-surface) p-6">
                        <h2 className="text-xl font-semibold mb-4">Connections</h2>
                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                            <p className="text-(--color-muted)">Steam <span className="text-(--color-text) ml-2">{steamLinked ? "Linked" : "Not linked"}</span></p>
                            {steamLinked ? (
                                <div className="flex gap-2">
                                    <Link href="/steamlink">
                                        <button className="px-4 py-1.5 text-sm bg-(--color-accent) text-(--color-bg) font-semibold rounded-[3px] hover:bg-(--color-accent-hover) transition-colors duration-200">
                                            Re-sync
                                        </button>
                                    </Link>
                                    <UnlinkSteamAccountButton />
                                </div>
                            ) : (
                                <Link href="/api/steam/link">
                                    <button className="px-4 py-1.5 text-sm bg-(--color-accent) text-(--color-bg) font-semibold rounded-[3px] hover:bg-(--color-accent-hover) transition-colors duration-200 whitespace-nowrap">
                                        Link account
                                    </button>
                                </Link>
                            )}
                        </div>
                        {steam_error === "1" && (
                            <p className="text-sm text-(--color-bad) mt-3">Error linking Steam account.</p>
                        )}
                        {steam_error === "2" && (
                            <p className="text-sm text-(--color-bad) mt-3">Your Steam games library is private. To import Steam games, go to Steam Profile -{'>'} Edit Profile -{'>'} Privacy Settings -{'>'} set &apos;Game Details&apos; to Public.</p>
                        )}
                    </section>

                    {/* Blocked users */}
                    <section className="border border-(--color-border) rounded-[3px] bg-(--color-surface) p-6">
                        <h2 className="text-xl font-semibold mb-1">Blocked users</h2>
                        <p className="text-sm text-(--color-muted) mb-4">Blocked players can&apos;t follow you, and you can&apos;t follow them.</p>
                        {blockedUsers.length > 0 ? (
                            <ul className="divide-y divide-(--color-border)">
                                {blockedUsers.map(b => (
                                    <li key={b.id} className="flex items-center justify-between gap-4 py-3">
                                        <Link href={`/user/${b.username}`} className="flex items-center gap-3 min-w-0 hover:text-(--color-accent) transition-colors duration-200">
                                            <Avatar src={b.avatar_url} alt={b.username} size="sm" />
                                            <span className="truncate">{b.username}</span>
                                        </Link>
                                        <UnblockUserButton userId={b.id} username={b.username} />
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-(--color-muted)">You haven&apos;t blocked anyone.</p>
                        )}
                    </section>

                    {/* Danger zone */}
                    <section className="border border-(--color-bad)/40 rounded-[3px] bg-(--color-surface) p-6">
                        <h2 className="text-xl font-semibold mb-1">Danger Zone</h2>
                        <p className="text-sm text-(--color-muted) mb-4">Deleting your account is permanent. Your library, ratings, reviews, and lists cannot be recovered.</p>
                        <DeleteAccountButton />
                    </section>
                </div>
            </div>
        </main>
    )
}