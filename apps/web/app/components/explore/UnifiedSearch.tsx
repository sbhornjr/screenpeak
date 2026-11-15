"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Heart } from "lucide-react"
import type { GameSearchHit, ListSearchHit, UserSearchHit } from "@screenpeak/shared/api/search"
import { parseDbTimestamp, releaseYear } from "@screenpeak/shared/dates"
import { searchGamesByName, searchLists, searchUsers } from "@/app/search-actions"
import Avatar from "@/app/components/user/Avatar"

// Explore's search box: games, lists, or players, one type at a time. Same
// 300ms debounce as SearchableDropdown. Every change to the text or the type
// takes a new request id, and an answer is drawn only if its id is still the
// latest, so a slow answer for an older text or type never replaces a newer one.

export const SEARCH_DEBOUNCE_MS = 300

const SEARCH_TYPES = ["games", "lists", "users"] as const
type SearchType = (typeof SEARCH_TYPES)[number]

const COPY: Record<SearchType, { tab: string, field: string, none: string }> = {
    games: { tab: "Games", field: "Search games", none: "games" },
    lists: { tab: "Lists", field: "Search lists", none: "lists" },
    users: { tab: "Players", field: "Search players", none: "players" },
}

/** Hits tagged with the type and text they answer. */
type Results =
    | { type: "games", query: string, hits: GameSearchHit[] }
    | { type: "lists", query: string, hits: ListSearchHit[] }
    | { type: "users", query: string, hits: UserSearchHit[] }

function searchTypeParam(value: string | null): SearchType {
    return SEARCH_TYPES.find(type => type === value) ?? "games"
}

async function runSearch(type: SearchType, query: string): Promise<Results> {
    switch (type) {
        case "games": return { type, query, hits: await searchGamesByName(query) }
        case "lists": return { type, query, hits: await searchLists(query) }
        case "users": return { type, query, hits: await searchUsers(query) }
    }
}

function plural(count: number, one: string, many: string) {
    return `${count} ${count === 1 ? one : many}`
}

const ROW = "flex items-center gap-3 min-w-0 px-3 py-2 border border-(--color-border) rounded-[3px] " +
    "hover:border-(--color-accent)/50 hover:bg-(--color-surface-light) transition-colors duration-200"
const NAME = "text-sm font-semibold text-(--color-text) font-(family-name:--font-display) truncate"
const META = "text-xs text-(--color-muted) font-mono whitespace-nowrap"

function GameRow({ hit }: { hit: GameSearchHit }) {
    const year = releaseYear(hit.released)
    return (
        <Link href={`/games/${hit.slug}`} className={ROW}>
            <div className="w-6 aspect-3/4 relative shrink-0 overflow-hidden rounded-[2px] bg-(--color-surface-light)">
                {hit.cover_image_url && <Image src={hit.cover_image_url} alt="" fill className="object-cover" sizes="48px" />}
            </div>
            <span className={`${NAME} flex-1`}>{hit.name}</span>
            <span className={META}>
                {[year, hit.avg_rating != null ? `SP ${hit.avg_rating}/10` : null].filter(Boolean).join(" · ")}
            </span>
        </Link>
    )
}

function ListRow({ hit }: { hit: ListSearchHit }) {
    const updated = hit.last_activity ? parseDbTimestamp(hit.last_activity) : null
    const covers = hit.covers.filter(cover => cover.cover_image_url).slice(0, 3)
    return (
        <div className={`${ROW} relative`}>
            <Link href={`/user/${hit.owner_username}/lists/${hit.id}`} aria-label={hit.name} className="absolute inset-0 z-0 rounded-[3px]" />
            <div className="flex shrink-0 -space-x-3" aria-hidden>
                {covers.length === 0
                    ? <div className="w-6 aspect-3/4 rounded-[2px] border border-dashed border-(--color-border)" />
                    : covers.map(cover => (
                        <div key={cover.slug ?? cover.cover_image_url} className="w-6 aspect-3/4 relative overflow-hidden rounded-[2px] border border-(--color-bg)">
                            <Image src={cover.cover_image_url!} alt="" fill className="object-cover" sizes="48px" />
                        </div>
                    ))}
            </div>
            <span className={`${NAME} flex-1`}>
                {hit.name} <span className="text-(--color-muted) font-normal">({hit.game_count})</span>
            </span>
            <Link href={`/user/${hit.owner_username}`} className="relative z-10 text-xs font-semibold text-(--color-muted)
                hover:text-(--color-accent) transition-colors duration-200 truncate max-w-[8rem]">{hit.owner_username}</Link>
            {updated && !Number.isNaN(updated.getTime()) && (
                <span className={`${META} hidden sm:inline`}>
                    Updated {updated.getMonth() + 1}/{updated.getDate()}/{updated.getFullYear()}
                </span>
            )}
            <span className={`${META} flex items-center gap-1`} aria-label={plural(hit.like_count, "like", "likes")}>
                <Heart size={12} aria-hidden />{hit.like_count}
            </span>
        </div>
    )
}

function UserRow({ hit }: { hit: UserSearchHit }) {
    return (
        <Link href={`/user/${hit.username}`} className={ROW}>
            <Avatar src={hit.avatar_url} alt={hit.username} size="sm" />
            <span className={`${NAME} flex-1`}>{hit.username}</span>
            <span className={META}>{plural(hit.follower_count, "follower", "followers")}</span>
        </Link>
    )
}

function Hits({ results }: { results: Results }) {
    if (results.hits.length === 0) {
        return <p className="text-sm text-(--color-muted)">{`No ${COPY[results.type].none} match "${results.query}".`}</p>
    }
    switch (results.type) {
        case "games": return results.hits.map(hit => <GameRow key={hit.id} hit={hit} />)
        case "lists": return results.hits.map(hit => <ListRow key={hit.id} hit={hit} />)
        case "users": return results.hits.map(hit => <UserRow key={hit.id} hit={hit} />)
    }
}

export default function UnifiedSearch() {
    const searchParams = useSearchParams()
    const [type, setType] = useState<SearchType>(() => searchTypeParam(searchParams.get("type")))
    const [query, setQuery] = useState("")
    const [results, setResults] = useState<Results | null>(null)
    const [searching, setSearching] = useState(false)
    const [error, setError] = useState(false)
    const latest = useRef(0)

    useEffect(() => {
        // Claim an id now, so any answer already in flight is stale from this moment.
        const id = ++latest.current
        const trimmed = query.trim()
        const timer = setTimeout(async () => {
            if (!trimmed) {
                setResults(null)
                setSearching(false)
                setError(false)
                return
            }
            setSearching(true)
            try {
                const answer = await runSearch(type, trimmed)
                if (id !== latest.current) return
                setResults(answer)
                setError(false)
            } catch {
                if (id !== latest.current) return
                setResults(null)
                setError(true)
            } finally {
                if (id === latest.current) setSearching(false)
            }
        }, SEARCH_DEBOUNCE_MS)
        return () => clearTimeout(timer)
    }, [query, type])

    const trimmed = query.trim()
    // Never draw one type's hits under another type's tab, even for the frame before the next search lands.
    const shown = results && results.type === type ? results : null

    return (
        <section className="flex flex-col gap-3 mb-10" aria-label="Search">
            <div className="flex gap-1" role="group" aria-label="Search for">
                {SEARCH_TYPES.map(option => (
                    <button
                        key={option}
                        type="button"
                        aria-pressed={type === option}
                        onClick={() => setType(option)}
                        className={`px-3 py-1 rounded-[3px] text-sm font-semibold transition-colors duration-200
                            ${type === option
                            ? "bg-(--color-accent) text-(--color-bg)"
                            : "text-(--color-muted) hover:text-(--color-accent)"}`}
                    >
                        {COPY[option].tab}
                    </button>
                ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
                <input
                    type="search"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={COPY[type].field}
                    aria-label={COPY[type].field}
                    className="flex-1 min-w-0 px-4 py-2 rounded-[3px] text-base
                        bg-(--color-surface) border border-(--color-border) text-(--color-text)
                        placeholder-(--color-muted) outline-none
                        focus:border-(--color-accent) focus:ring-1 focus:ring-(--color-accent)
                        transition-all duration-200"
                />
                {/* Browse all is the games catalogue, so it only sits beside a games search. */}
                {type === "games" && (
                    <Link
                        href={trimmed ? `/games?${new URLSearchParams({ q: trimmed })}` : "/games"}
                        className="px-4 py-2 rounded-[3px] text-sm font-semibold text-center whitespace-nowrap
                            border border-(--color-border) text-(--color-text)
                            hover:border-(--color-accent) hover:text-(--color-accent) transition-colors duration-200"
                    >
                        Browse all
                    </Link>
                )}
            </div>
            <div aria-live="polite" className="flex flex-col gap-1.5">
                {searching && <p className="text-sm text-(--color-muted)">Searching {COPY[type].none}...</p>}
                {error && trimmed && (
                    <p role="alert" className="text-sm text-(--color-bad)">Couldn&apos;t search {COPY[type].none}. Try again.</p>
                )}
                {!searching && shown && trimmed && <Hits results={shown} />}
            </div>
        </section>
    )
}
