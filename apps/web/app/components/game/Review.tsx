import Link from "next/link"
import ExpandableText from "../util/ExpandableText"
import Avatar from "../user/Avatar"

export default function Review({ rating_review, gameName, gameSlug } : { rating_review: { rating: number, review: string, user_id: string, created_at: string, updated_at: string,
    users: { username: string, display_name: string, avatar_url: string }}, gameName?: string, gameSlug?: string}) {

    const ngScoreColor = rating_review.rating >= 8
    ? 'var(--color-good)'
    : rating_review.rating >= 6
    ? 'var(--color-mid)'
    : rating_review.rating >= 3
    ? 'var(--color-bad)'
    : 'var(--color-muted)'

    return (
        <div className="border border-(--color-border) rounded-[3px] px-4 py-4 mb-3 bg-(--color-surface)">
              {/* Game name as headline */}
            {gameName && gameSlug && (
                <Link
                    href={`/games/${gameSlug}`}
                    className="text-sm font-semibold text-(--color-muted) hover:text-(--color-accent)
                        transition-colors duration-200 mb-2 block"
                >
                    {gameName}
                </Link>
            )}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                    <Avatar src={rating_review.users.avatar_url} alt={rating_review.users.username} size="sm" />
                    <div>
                        <Link href={`/user/${rating_review.users.username}`} className="text-sm font-semibold text-(--color-text) hover:text-(--color-accent) mx-2">
                            {rating_review.users.username}
                        </Link>
                        <p className="text-xs text-(--color-muted) mx-2">
                            {new Date(rating_review.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                    </div>
                </div>
                {/* Rating badge */}
                <span className="text-xl font-bold font-mono ml-auto"
                style={{ color: ngScoreColor }}>
                {rating_review.rating}<span className="text-sm text-(--color-muted) font-normal">/10</span>
                </span>
            </div>
            {rating_review.review && (
                <ExpandableText text={rating_review.review} lines={8} className="text-sm text-(--color-muted) leading-relaxed" />
            )}
        </div>
    )
}