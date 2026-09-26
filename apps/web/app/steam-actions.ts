'use server'

import { requireUser } from '@/lib/auth'
import { unlinkSteamAccount } from '@/lib/queries/steam'

export async function unlinkSteamAccountAction() {
    const user = await requireUser()
    await unlinkSteamAccount(user.id)
}
