import { notFound } from "next/navigation"
import TitleSelectButton from "@/app/components/user/TitleSelectButton"
import AvatarUploader from "@/app/components/user/AvatarUploader"
import Avatar from "@/app/components/user/Avatar"
import FavoriteGamePicker from "@/app/components/game/FavoriteGamePicker"
import GameCard from "@/app/components/game/GameCard"
import Review from "@/app/components/game/Review"
import Link from "next/link"
import FollowButton from "@/app/components/user/FollowButton"
import BioButton from "@/app/components/user/BioButton"
import StatGrid from "@/app/components/util/StatGrid"
import SectionHead from "@/app/components/util/SectionHead"
import Eyebrow from "@/app/components/util/Eyebrow"
import EmptyState from "@/app/components/util/EmptyState"
import { getOptionalUser } from "@/lib/auth"
import { loadProfilePage } from "@/lib/loaders/profile-page"
import { getProfileSummaryByUsername } from "@/lib/queries/user"
import { Metadata } from "next"

type ProfilePageProps = {
    params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
    const { username } = await params
    const profile = await getProfileSummaryByUsername(username)
    if (!profile) return {}
    return {
        title: username,
        description: `Follow ${username} on ScreenPeak.`,
        openGraph: {
            title: username,
            images: profile.avatar_url ? [profile.avatar_url] : [],
        },
    }
}

export default async function ProfilePage({ params }: ProfilePageProps) {
    const { username } = await params

    const viewer = await getOptionalUser()
    let data
    try {
        data = await loadProfilePage(username, viewer?.id ?? null)
    } catch {
        return (
            <main>
                <div className="w-full max-w-6xl mx-auto px-6 sm:px-8 pt-8 pb-16">
                    <EmptyState title="Couldn't load this profile" description="Try again in a moment." />
                </div>
            </main>
        )
    }
    if (!data) notFound()

    const profile = data.profile
    const isOwnProfile = data.viewer?.is_owner ?? false
    const favoriteGames = data.favorites
    const recentReviews = data.recent_reviews
    const topDeveloperNames = data.viewer?.top_developer_names ?? []
    const ratingCount = data.rating_count
    const avgRating = data.avg_rating ?? 0
    const currentTitle = profile.selected_title ? profile.selected_title : "Title-less Noob"
    const followersCount = profile.follower_count
    const followingCount = profile.following_count

    return (
        <main>
            <div className="w-full max-w-6xl mx-auto px-6 sm:px-8 pt-8 pb-16">
                <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 mb-4">
                    {isOwnProfile ? (
                        <AvatarUploader username={username} currentAvatarUrl={profile.avatar_url} />
                    ) : (
                        <Avatar src={profile.avatar_url} alt={username} size="lg" />
                    )}
                    <div className="flex flex-col min-w-0">
                        <Eyebrow className="!text-[0.625rem] !mb-0.5">Player Card</Eyebrow>
                        <h1 className="text-3xl font-semibold font-(family-name:--font-display)">{username}</h1>
                        <div className="flex">
                            <p className="text-lg font-semibold font-(family-name:--font-display)">{currentTitle}</p>
                            {isOwnProfile && <TitleSelectButton currentTitle={currentTitle} topGames={favoriteGames ? favoriteGames.map(g => g.name) : []} topDevelopers={topDeveloperNames} />}
                        </div>
                        <p className="text-md font-semibold font-(family-name:--font-display) text-(--color-muted)">Member since {new Date(profile.created_at ?? '').getMonth() + 1}/{new Date(profile.created_at ?? '').getDate()}/{new Date(profile.created_at ?? '').getFullYear()}</p>
                        <p className="text-md font-semibold font-(family-name:--font-display) text-(--color-muted)">{followersCount} Followers | {followingCount} Following</p>
                    </div>
                    {!isOwnProfile && viewer && (
                        <div className="sm:ml-auto">
                            <FollowButton targetUserId={profile.id} initialIsFollowing={data.viewer?.is_following ?? false} />
                        </div>
                    )}
                </div>

                {/* Links to this player's other pages — nav, not on-page tabs */}
                <nav className="flex flex-wrap items-center gap-3 mb-8 text-sm font-semibold font-(family-name:--font-display)">
                    {[
                        { label: 'Profile', href: null as string | null },
                        ...(isOwnProfile || profile.library_public ? [{ label: 'Library', href: `/user/${username}/library` }] : []),
                        ...(isOwnProfile || profile.loadout_public ? [{ label: 'Loadout', href: `/user/${username}/loadout` }] : []),
                        { label: 'Lists', href: `/user/${username}/lists` },
                    ].map((item, i) => (
                        <span key={item.label} className="flex items-center gap-3">
                            {i > 0 && <span className="text-(--color-border)" aria-hidden="true">/</span>}
                            {item.href
                                ? <Link href={item.href} className="text-(--color-muted) hover:text-(--color-accent) transition-colors duration-200">{item.label}</Link>
                                : <span className="text-(--color-accent)" aria-current="page">{item.label}</span>}
                        </span>
                    ))}
                </nav>

                <StatGrid stats={[
                    ...(data.library_stats ? [
                        { label: 'Games', value: data.library_stats.total_games },
                        { label: 'Completed', value: data.library_stats.completed },
                    ] : []),
                    { label: 'Rated', value: ratingCount },
                    { label: 'Avg Rating', value: ratingCount
                        ? <>{Math.trunc(avgRating * 100) / 100}<span className="text-base text-(--color-muted)"> / 10</span></>
                        : <span className="text-(--color-muted)">&mdash;</span> },
                ]} />
                {profile.profile_loadout_bio && (
                    <p className="mt-6 mb-2 text-lg italic leading-relaxed text-(--color-text) font-(family-name:--font-display) max-w-2xl mx-auto text-center">
                        &ldquo;{profile.profile_loadout_bio}&rdquo;
                    </p>
                )}

                <SectionHead action={isOwnProfile && <BioButton currentBio={profile.user_bio ?? ''} />}>Bio</SectionHead>
                {profile.user_bio
                    ? <p className="text-(--color-text) leading-relaxed max-w-2xl">{profile.user_bio}</p>
                    : <p className="text-(--color-muted) text-sm">{isOwnProfile ? "You haven't written a bio yet." : "No bio yet."}</p>}
                <SectionHead action={isOwnProfile && <FavoriteGamePicker currentGames={favoriteGames.map(g => ({ id: g.id, name: g.name, slug: g.slug, cover_image_url: g.cover_image_url, released: g.released }))}/>}>Favorite Games</SectionHead>
                {favoriteGames.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                        {favoriteGames.map(g =>
                            <GameCard
                                key={g.id}
                                game={{ id: g.id, name: g.name, slug: g.slug, cover_image_url: g.cover_image_url, released: g.released }}
                                developer={g.developer}
                                userRating={g.user_rating}
                                ngplusRating={g.avg_rating}
                            />
                        )}
                    </div>
                ) : (
                    <EmptyState
                        dense
                        title="No favorite games yet"
                        description={isOwnProfile ? "Pin a few games you love and they'll show up here." : "This player hasn't picked any favorites yet."}
                    />
                )}
                <div className="flex flex-col">
                    <SectionHead action={
                        <Link className="font-mono text-[0.625rem] uppercase tracking-[0.15em] hover:text-(--color-accent) transition-colors duration-200" href={`/user/${username}/ratings_reviews`}>View all</Link>
                    }>Recent Reviews</SectionHead>
                    {recentReviews && recentReviews.length > 0
                        ? recentReviews.map(r => <Review key={r.games.name} gameName={r.games.name} gameSlug={r.games.slug} rating_review={r}/>)
                        : <EmptyState dense title="No reviews yet" description={isOwnProfile ? "Rate and review a game to start building your record." : "This player hasn't reviewed anything yet."} />}
                </div>
            </div>
        </main>
    )
}