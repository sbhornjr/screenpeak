// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { UserReviewsPage } from '@screenpeak/shared/api/user-reviews'

const push = vi.fn()
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push }),
    notFound: () => { throw new Error('notFound') },
}))
vi.mock('next/image', () => ({ default: () => null }))

const loadUserReviews = vi.fn()
vi.mock('@/lib/loaders/user-reviews', () => ({ loadUserReviews: (...args: unknown[]) => loadUserReviews(...args) }))

const { default: RatingsPage } = await import('@/app/user/[username]/ratings_reviews/page')

function data(items: UserReviewsPage['items'], counts = { total_count: 0, review_count: 0, rating_count: 0 }): UserReviewsPage {
    return { username: 'ada', counts, total: items.length, total_pages: items.length ? 1 : 0, items }
}

async function renderPage(search: Record<string, string> = {}) {
    const page = await RatingsPage({ params: Promise.resolve({ username: 'ada' }), searchParams: Promise.resolve(search) })
    render(page)
}

beforeEach(() => {
    loadUserReviews.mockReset()
})

afterEach(() => {
    cleanup()
    push.mockReset()
})

function showSelect() {
    const select = screen.getAllByRole('combobox').find(element =>
        [...element.querySelectorAll('option')].some(option => option.value === 'reviews'))
    if (!select) throw new Error('Show select was not rendered')
    return select as HTMLSelectElement
}

describe('ratings and reviews page', () => {
    it('says a player has rated nothing yet', async () => {
        loadUserReviews.mockResolvedValue(data([]))
        await renderPage()
        expect(screen.getByRole('heading', { name: 'No ratings yet.' })).toBeInTheDocument()
        expect(screen.getByText('Games ada rates show up here.')).toBeInTheDocument()
    })

    it('keeps Show and Sort when the Reviews filter matches nothing, so it can be switched back', async () => {
        loadUserReviews.mockResolvedValue(data([], { total_count: 2, review_count: 0, rating_count: 2 }))
        await renderPage({ filter: 'reviews' })
        expect(screen.getByRole('heading', { name: 'No written reviews yet.' })).toBeInTheDocument()
        expect(showSelect().value).toBe('reviews')
        expect(screen.getByRole('button', { name: 'Sort descending — tap for ascending' })).toBeInTheDocument()
    })

    it('lists the ratings with the filters and no empty message when there are rows', async () => {
        loadUserReviews.mockResolvedValue(data([{
            game_id: 'g1', game_name: 'Hades', game_slug: 'hades', cover_image_url: null, released: '2020-09-17',
            developer: 'Supergiant Games', rating: 9, review: '', updated_at: '2026-10-01 12:00:00+00',
        }], { total_count: 1, review_count: 0, rating_count: 1 }))
        await renderPage()
        expect(screen.getByRole('link', { name: /Hades/ })).toHaveAttribute('href', '/games/hades')
        expect(showSelect().value).toBe('all')
        expect(screen.queryByRole('heading', { name: 'No ratings yet.' })).not.toBeInTheDocument()
    })

    it('says when there are no score-only ratings', async () => {
        loadUserReviews.mockResolvedValue(data([], { total_count: 1, review_count: 1, rating_count: 0 }))
        await renderPage({ filter: 'ratings' })
        expect(screen.getByRole('heading', { name: 'No score-only ratings.' })).toBeInTheDocument()
        expect(showSelect().value).toBe('ratings')
    })
})
