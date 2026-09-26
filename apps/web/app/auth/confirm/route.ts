import { type EmailOtpType } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

// Landing point for every Supabase auth email link: signup confirmation,
// password reset (type=recovery), and email-change confirmation.
//
// Handles both link formats:
//   ?token_hash=…&type=…   → custom email template (needs custom SMTP to edit)
//   ?code=…                → Supabase's DEFAULT template, after its own /auth/v1/verify
export async function GET(request: NextRequest) {
    const { searchParams, origin } = request.nextUrl
    const next = searchParams.get('next') ?? '/'
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type') as EmailOtpType | null
    const code = searchParams.get('code')

    const supabase = await createClient()

    let result
    if (token_hash && type) {
        result = await supabase.auth.verifyOtp({ type, token_hash })
    } else if (code) {
        result = await supabase.auth.exchangeCodeForSession(code)
    } else {
        return NextResponse.redirect(`${origin}/?auth_error=invalid_link`)
    }

    if (result.error) {
        return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(result.error.message)}`)
    }

    // A recovery link must land on the set-new-password page. The token_hash flow
    // tells us via `type`; the code flow relies on `next` being set on redirectTo.
    const dest = type === 'recovery' ? '/auth/update-password' : next
    return NextResponse.redirect(`${origin}${dest}`)
}
