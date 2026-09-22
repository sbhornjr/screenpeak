import Anthropic from '@anthropic-ai/sdk'
import { logger } from './logger'
import { SupabaseClient } from '@supabase/supabase-js'
import { getLoadoutGenreStats, getLoadoutDeveloperStats, getLoadoutStatusBreakdown } from '@/lib/queries/stats'
import { getUserRatings } from '@/lib/queries/review'

type LoadoutData = {
    username: string
    totalGames: number
    completedGames: number
    totalRatings: number
    avgRating: number
    topGenres: { genre_name: string, weighted_rating: number, rated_count: number, completed_count: number }[]
    topDevelopers: { developer_name: string, weighted_rating: number, rated_count: number, game_count: number }[]
}

export async function buildLoadoutInput(supabase: SupabaseClient, userId: string, username: string): Promise<LoadoutData> {
    const [genreStats, developerStats, statusStats, ratingsReviews] = await Promise.all([
        getLoadoutGenreStats(userId),
        getLoadoutDeveloperStats(userId),
        getLoadoutStatusBreakdown(userId),
        getUserRatings(supabase, userId)
    ])

    const totalGames = statusStats.reduce((a, s) => a + s.count, 0)
    const completedGames = statusStats.find(s => s.status === 'completed')?.count ?? 0
    const avgRating = ratingsReviews.length > 0 ? ratingsReviews.reduce((acc, r) => { return acc + r.rating}, 0) / ratingsReviews.length : 0

    return {
        username, totalGames, completedGames,
        totalRatings: ratingsReviews.length, avgRating,
        topGenres: genreStats ?? [], topDevelopers: developerStats ?? [],
    }
}

// Failures here (rate limit, bad key, network) shouldn't take down the whole
// Loadout page — the identity paragraph is a bonus, not required content. Log
// the real error server-side and let the caller fall back to no paragraph.
export async function generateLoadoutIdentity(data: LoadoutData): Promise<string> {
    try {
        return await requestLoadoutIdentity(data)
    } catch (err) {
        logger.error('loadout', 'Failed to generate loadout identity', {
            username: data.username,
            error: err instanceof Error ? err.message : String(err),
        })
        return ''
    }
}

async function requestLoadoutIdentity(data: LoadoutData): Promise<string> {
    const client = new Anthropic()

    const topGenresSummary = data.topGenres.slice(0, 5).map(g =>
        `${g.genre_name} (${g.weighted_rating} avg, ${g.rated_count} rated, ${g.completed_count} completed)`
    ).join(', ')

    const topDevsSummary = data.topDevelopers.slice(0, 3).map(d =>
        `${d.developer_name} (${d.weighted_rating} avg, ${d.rated_count} rated)`
    ).join(', ')

    const prompt = `You are writing a short, punchy "gamer identity" paragraph for a user's gaming profile page called a Loadout. Based on their gaming data, write 2-3 sentences that capture who they are as a gamer. Be specific, use their actual data, and make it feel personal and a little fun — like a character description. Don't be generic. Don't use phrases like "based on your data" or "according to your stats." Just describe them directly as a gamer. Write in second person — use "you" and "your", not "they" or "their". Address the user directly.

Here is their data:
- Username: ${data.username}
- Total games in library: ${data.totalGames}
- Completed games: ${data.completedGames} (${Math.round((data.completedGames / data.totalGames) * 100)}% completion rate)
- Average rating: ${data.avgRating}/10 across ${data.totalRatings} rated games
- Top genres by weighted rating: ${topGenresSummary}
- Favorite developers: ${topDevsSummary}

Write the identity paragraph now. 2-3 sentences max. No header, no label, just the paragraph.`

    const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }]
    })

    const content = message.content[0]
    if (content.type === 'text') return content.text
    return ''
}