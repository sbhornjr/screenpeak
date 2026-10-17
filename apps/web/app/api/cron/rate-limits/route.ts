import { deleteStaleRateLimits } from '@/lib/rate-limit'
import { deleteSpentSteamLinkIntents } from '@/lib/steam-link-intent'

// Vercel Cron sends GET with Authorization: Bearer $CRON_SECRET. This is not
// an /api/v1 route. Unset CRON_SECRET fails closed. The deletes stay off the
// request path that spends a budget.
export async function GET(req: Request) {
    const secret = process.env.CRON_SECRET
    const authorization = req.headers.get('authorization')
    if (!secret || authorization !== `Bearer ${secret}`) {
        return Response.json({ error: 'unauthorized' }, { status: 401 })
    }
    const [deleted, intents] = await Promise.all([
        deleteStaleRateLimits(),
        deleteSpentSteamLinkIntents(),
    ])
    return Response.json({ deleted, intents })
}
