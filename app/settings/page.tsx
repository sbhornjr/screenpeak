import { createClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import AvatarUploader from "../components/user/AvatarUploader";
import ChangeUsernameButton from "../components/settings/ChangeUsernameButton";
import ChangeEmailButton from "../components/settings/ChangeEmailButton";
import ChangePasswordButton from "../components/settings/ChangePasswordButton";
import DeleteAccountButton from "../components/settings/DeleteUserButton";
import ChangePrivacyButton from "../components/settings/ChangePrivacyButton";
import { getViewer, getAccountSettings } from "@/lib/queries/user";
import { getSteamAccount } from "@/lib/queries/steam";
import UnlinkSteamAccountButton from "../components/settings/UnlinkSteamAccountButton";
import Link from "next/link";

type SettingsPageProps = {
    searchParams: Promise<{ steam_error?: string }>
}

export default async function Settings({ searchParams } : SettingsPageProps) {
    const { steam_error } = await searchParams
    const supabase = await createClient()
    const viewer = await getViewer(supabase)

    if (!viewer) redirect("/")

    const user = await getAccountSettings(supabase, viewer.id)

    if (!user) {
        console.log("User not found")
        redirect("/")
    }

    const steamUser = await getSteamAccount(supabase, viewer.id)

    return (
        <main>
            <div className="w-full max-w-2xl mx-auto px-6 pt-8 pb-16 font-(family-name:--font-display)">
                <p className="font-mono text-[0.6875rem] uppercase tracking-[0.22em] text-(--color-muted) mb-1"><span className="text-(--color-accent)" aria-hidden="true">▸</span> System</p>
                <h1 className="text-4xl font-bold tracking-tight mb-6">Settings</h1>
                <div className="flex gap-5 items-center mb-8">
                    <AvatarUploader userId={user.id} username={user.username} currentAvatarUrl={user.avatar_url} />
                    <div className="flex flex-col min-w-0">
                        <h2 className="text-2xl font-semibold font-(family-name:--font-display)">{user.username}</h2>
                        <p className="text-sm font-semibold text-(--color-muted)">{user.selected_title}</p>
                        <p className="text-sm text-(--color-muted)">Member since {new Date(user.created_at).getMonth() + 1}/{new Date(user.created_at).getDate()}/{new Date(user.created_at).getFullYear()}</p>
                    </div>
                </div>

                <div className="flex flex-col gap-6">
                    {/* Account */}
                    <section className="border border-(--color-border) rounded-[3px] bg-(--color-surface) p-6">
                        <h2 className="text-xl font-semibold mb-4">Account</h2>
                        <div className="divide-y divide-(--color-border)">
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                                <p className="text-(--color-muted)">Username <span className="text-(--color-text) ml-2">{user.username}</span></p>
                                <ChangeUsernameButton userId={user.id} currentUsername={user.username} />
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                                <p className="text-(--color-muted) min-w-0 truncate">Email <span className="text-(--color-text) ml-2">{viewer.email}</span></p>
                                <ChangeEmailButton currentEmail={viewer.email!} />
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
                                <ChangePrivacyButton currentPrivacy={user.default_list_public} type="Default List" userId={user.id} />
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                                <p className="text-(--color-muted)">Library <span className="text-(--color-text) ml-2">{user.library_public ? "Public" : "Private"}</span></p>
                                <ChangePrivacyButton currentPrivacy={user.library_public} type="Library" userId={user.id} />
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                                <p className="text-(--color-muted)">Loadout <span className="text-(--color-text) ml-2">{user.loadout_public ? "Public" : "Private"}</span></p>
                                <ChangePrivacyButton currentPrivacy={user.loadout_public} type="Loadout" userId={user.id} />
                            </div>
                        </div>
                    </section>

                    {/* Connections */}
                    <section className="border border-(--color-border) rounded-[3px] bg-(--color-surface) p-6">
                        <h2 className="text-xl font-semibold mb-4">Connections</h2>
                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                            <p className="text-(--color-muted)">Steam <span className="text-(--color-text) ml-2">{steamUser ? "Linked" : "Not linked"}</span></p>
                            {steamUser ? (
                                <div className="flex gap-2">
                                    <Link href="/steamlink">
                                        <button className="px-4 py-1.5 text-sm bg-(--color-accent) text-(--color-bg) font-semibold rounded-[3px] hover:bg-(--color-accent-hover) transition-colors duration-200">
                                            Re-sync
                                        </button>
                                    </Link>
                                    <UnlinkSteamAccountButton userId={user.id} />
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