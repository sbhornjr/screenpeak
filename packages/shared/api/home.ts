// GET /api/v1/home — the signed-out landing page. The signed-in home is the feed.
import type { GameCardData } from './games'

export type HomeReview = {
    user_id: string
    rating: number
    review: string
    created_at: string
    updated_at: string
    users: { username: string; display_name: string; avatar_url: string | null }
    games: { name: string; slug: string; cover_image_url: string | null }
}

export type HomeHero = {
    id: string
    name: string
    slug: string
    cover_image_url: string | null
    artwork_image_url: string | null
    screenshots: string[]
    released: string | null
    avg_rating: number
    rating_count: number
}

export type HomeLandingData = {
    hero: HomeHero | null
    trending_games: GameCardData[]
    recent_reviews: HomeReview[]
    featured_loadout: { username: string; avatar_url: string | null; loadout_identity: string } | null
}
