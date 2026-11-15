// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { GameSearchHit, ListSearchHit, UserSearchHit } from '@screenpeak/shared/api/search'

const { searchGamesByName, searchUsers, searchLists, params } = vi.hoisted(() => ({
    searchGamesByName: vi.fn(),
    searchUsers: vi.fn(),
    searchLists: vi.fn(),
    params: { value: new URLSearchParams() },
}))
vi.mock('@/app/search-actions', () => ({ searchGamesByName, searchUsers, searchLists }))
vi.mock('next/navigation', () => ({ useSearchParams: () => params.value }))
vi.mock('next/image', () => ({
    // jsdom stub. The real optimizer is not under test here.
    default: (props: { alt: string }) => <img alt={props.alt} />, // eslint-disable-line @next/next/no-img-element
}))

import UnifiedSearch, { SEARCH_DEBOUNCE_MS } from '@/app/components/explore/UnifiedSearch'

const game = (patch: Partial<GameSearchHit> = {}): GameSearchHit => ({
    id: 'g1', name: 'Hades', slug: 'hades', cover_image_url: null, released: '2020-09-17', avg_rating: 9.1, ...patch,
})
const user = (patch: Partial<UserSearchHit> = {}): UserSearchHit => ({
    id: 'u1', username: 'ada', avatar_url: null, follower_count: 3, ...patch,
})
const list = (patch: Partial<ListSearchHit> = {}): ListSearchHit => ({
    id: 'l1', name: 'Roguelites', description: '', owner_username: 'grace', last_activity: '2026-11-01 10:00:00+00',
    game_count: 4, like_count: 2, viewer_has_liked: false, covers: [], ...patch,
})

function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>(r => { resolve = r })
    return { promise, resolve }
}

function type(text: string) {
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: text } })
}

async function elapse(ms = SEARCH_DEBOUNCE_MS) {
    await act(async () => { vi.advanceTimersByTime(ms) })
}

beforeEach(() => {
    vi.useFakeTimers()
    params.value = new URLSearchParams()
})

afterEach(() => {
    cleanup()
    vi.useRealTimers()
    searchGamesByName.mockReset()
    searchUsers.mockReset()
    searchLists.mockReset()
})

describe('UnifiedSearch', () => {
    it('searches games 300ms after typing stops, with no submit', async () => {
        searchGamesByName.mockResolvedValue([game()])
        render(<UnifiedSearch />)

        type('had')
        await elapse(SEARCH_DEBOUNCE_MS - 1)
        type('hades')
        await elapse(SEARCH_DEBOUNCE_MS - 1)
        expect(searchGamesByName).not.toHaveBeenCalled()

        await elapse(1)
        expect(searchGamesByName).toHaveBeenCalledTimes(1)
        expect(searchGamesByName).toHaveBeenCalledWith('hades')
        expect(screen.getByRole('link', { name: /Hades/ })).toHaveAttribute('href', '/games/hades')
        expect(searchUsers).not.toHaveBeenCalled()
        expect(searchLists).not.toHaveBeenCalled()
    })

    it('preselects players from ?type=users', async () => {
        params.value = new URLSearchParams('type=users')
        searchUsers.mockResolvedValue([user()])
        render(<UnifiedSearch />)

        expect(screen.getByRole('button', { name: 'Players' })).toHaveAttribute('aria-pressed', 'true')
        type('ad')
        await elapse()
        expect(searchUsers).toHaveBeenCalledWith('ad')
        expect(searchGamesByName).not.toHaveBeenCalled()
        expect(screen.getByRole('link', { name: /ada/ })).toHaveAttribute('href', '/user/ada')
        expect(screen.getByText('3 followers')).toBeInTheDocument()
    })

    it('ignores an unknown ?type= and falls back to games', () => {
        params.value = new URLSearchParams('type=bogus')
        render(<UnifiedSearch />)
        expect(screen.getByRole('button', { name: 'Games' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('drops a late games answer after switching to players', async () => {
        const slowGames = deferred<GameSearchHit[]>()
        searchGamesByName.mockReturnValue(slowGames.promise)
        searchUsers.mockResolvedValue([user({ username: 'adam' })])
        render(<UnifiedSearch />)

        type('ada')
        await elapse()
        expect(searchGamesByName).toHaveBeenCalledWith('ada')

        fireEvent.click(screen.getByRole('button', { name: 'Players' }))
        await elapse()
        expect(searchUsers).toHaveBeenCalledWith('ada')
        expect(screen.getByRole('link', { name: /adam/ })).toBeInTheDocument()

        await act(async () => { slowGames.resolve([game({ name: 'Adagio' })]) })
        expect(screen.queryByText('Adagio')).not.toBeInTheDocument()
        expect(screen.getByRole('link', { name: /adam/ })).toBeInTheDocument()
    })

    it('drops a late answer to an older query of the same type', async () => {
        const slow = deferred<GameSearchHit[]>()
        searchGamesByName.mockReturnValueOnce(slow.promise).mockResolvedValueOnce([game({ id: 'g2', name: 'Hades II', slug: 'hades-ii' })])
        render(<UnifiedSearch />)

        type('hades')
        await elapse()
        type('hades ii')
        await elapse()
        expect(screen.getByText('Hades II')).toBeInTheDocument()

        await act(async () => { slow.resolve([game({ name: 'Hades (old)' })]) })
        expect(screen.queryByText('Hades (old)')).not.toBeInTheDocument()
        expect(screen.getByText('Hades II')).toBeInTheDocument()
    })

    it('clears the results when the box is emptied, even if a search is in flight', async () => {
        const slow = deferred<GameSearchHit[]>()
        searchGamesByName.mockReturnValue(slow.promise)
        render(<UnifiedSearch />)

        type('hades')
        await elapse()
        type('')
        await elapse()
        await act(async () => { slow.resolve([game()]) })
        expect(screen.queryByText('Hades')).not.toBeInTheDocument()
    })

    it('draws a compact list row linking the list and its owner separately', async () => {
        searchLists.mockResolvedValue([list()])
        render(<UnifiedSearch />)
        fireEvent.click(screen.getByRole('button', { name: 'Lists' }))

        type('rogue')
        await elapse()
        expect(searchLists).toHaveBeenCalledWith('rogue')
        expect(screen.getByRole('link', { name: 'Roguelites' })).toHaveAttribute('href', '/user/grace/lists/l1')
        expect(screen.getByRole('link', { name: 'grace' })).toHaveAttribute('href', '/user/grace')
    })

    it('says so when nothing matches', async () => {
        searchUsers.mockResolvedValue([])
        params.value = new URLSearchParams('type=users')
        render(<UnifiedSearch />)
        type('zzz')
        await elapse()
        expect(screen.getByText('No players match "zzz".')).toBeInTheDocument()
    })

    it('shows an error instead of an empty result when the search fails', async () => {
        searchGamesByName.mockRejectedValue(new Error('down'))
        render(<UnifiedSearch />)
        type('hades')
        await elapse()
        expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t search/i)
    })

    it('clears a previous tab\'s stale error as soon as the tab switches, not when the new answer lands', async () => {
        searchGamesByName.mockRejectedValue(new Error('down'))
        const slowUsers = deferred<UserSearchHit[]>()
        searchUsers.mockReturnValue(slowUsers.promise)
        render(<UnifiedSearch />)

        type('hades')
        await elapse()
        expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t search/i)

        fireEvent.click(screen.getByRole('button', { name: 'Players' }))
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()

        await act(async () => { slowUsers.resolve([user()]) })
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('keeps Browse all to games, pointing at the catalogue with the query', async () => {
        searchGamesByName.mockResolvedValue([])
        render(<UnifiedSearch />)
        expect(screen.getByRole('link', { name: /Browse all/ })).toHaveAttribute('href', '/games')

        type('hades & co')
        await elapse()
        expect(screen.getByRole('link', { name: /Browse all/ })).toHaveAttribute('href', '/games?q=hades+%26+co')

        fireEvent.click(screen.getByRole('button', { name: 'Players' }))
        expect(screen.queryByRole('link', { name: /Browse all/ })).not.toBeInTheDocument()
    })
})
