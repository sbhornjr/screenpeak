"use client"

import { createClient } from "@/lib/supabase-browser";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/app/components/util/Modal";
import EditTriggerButton from "@/app/components/util/EditTriggerButton";
import { signInWithPassword, updatePassword } from "@/lib/queries/user-auth";

export default function ChangePasswordButton() {
    const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false)
    const [oldPassword, setOldPassword] = useState("")
    const [newPassword, setNewPassword] = useState("")
    const [errorMsg, setErrorMsg] = useState("")
    const router = useRouter()

    async function submitPassword() {
        setErrorMsg("")
        const supabase = createClient()

        const { data: { user: viewer } } = await supabase.auth.getUser()
        const signInError = await signInWithPassword(supabase, viewer!.email!, oldPassword)

        if (signInError) {
            setErrorMsg('Current password is incorrect')
            return
        }

        const updateError = await updatePassword(supabase, newPassword)

        if (updateError) {
            setErrorMsg(updateError)
            return
        }

        setIsChangePasswordModalOpen(false)
        router.refresh()
    }

    return (
        <div className="mx-2">
            <EditTriggerButton onClick={() => setIsChangePasswordModalOpen(true)} />
            {isChangePasswordModalOpen &&
                <Modal
                    onClose={() => setIsChangePasswordModalOpen(false)}
                    title="Change Password"
                    panelClassName="w-full max-w-md max-h-8/10 p-8"
                >
                        <form onSubmit={(e) => { e.preventDefault(); submitPassword() }}>
                            <div className="flex flex-col mt-4">
                                <p className="font-semibold text-lg text-(--color-muted)">Old Password:</p>
                                <input
                                    type="password"
                                    placeholder="Password..."
                                    value={oldPassword}
                                    onChange={(e) => setOldPassword(e.target.value)}
                                    className="w-full bg-(--color-surface) text-(--color-text) placeholder:text-(--color-muted) self-center justify-self-center border border-(--color-border) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:border-(--color-accent) rounded-[3px] px-2 py-1"
                                />
                            </div>
                            <div className="flex flex-col mt-4">
                                <p className="font-semibold text-lg text-(--color-muted)">New Password:</p>
                                <input
                                    type="password"
                                    placeholder="Password..."
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full bg-(--color-surface) text-(--color-text) placeholder:text-(--color-muted) self-center justify-self-center border border-(--color-border) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:border-(--color-accent) rounded-[3px] px-2 py-1"
                                />
                            </div>
                            {errorMsg && (
                                <p className="font-semibold text-lg text-(--color-bad) mt-4">{errorMsg}</p>
                            )}
                            <button type="submit" className="px-4 py-1 mt-4 text-md bg-(--color-accent) text-(--color-bg) font-semibold rounded-[3px] hover:bg-(--color-accent-hover) transition-colors duration-200">
                                Submit
                            </button>
                        </form>
                </Modal>
            }
        </div>
    )
}
