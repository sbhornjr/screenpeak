import { NextResponse } from 'next/server'
import { deleteAccount } from '@/lib/account-deletion'
import { requireUser } from '@/lib/auth'
import { apiError, withAuth } from '@/lib/api'

// The website's delete. The phone calls DELETE /api/v1/me.
export const DELETE = withAuth(async () => {
    const user = await requireUser()

    const { error } = await deleteAccount(user.id)
    if (error) return apiError(500, 'internal', 'Could not delete the account. Please try again.')

    return NextResponse.json({ success: true })
})
