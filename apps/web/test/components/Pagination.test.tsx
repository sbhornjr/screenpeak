// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import Pagination from '@/app/components/util/Pagination'

// next/link needs the App Router runtime; swap it for a plain anchor so the
// test focuses on Pagination's own page-window math and href building.
vi.mock('next/link', async () => {
    const React = await vi.importActual<typeof import('react')>('react')
    return {
        default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
            React.createElement('a', { href, ...rest }, children),
    }
})

afterEach(cleanup)

describe('Pagination', () => {
    it('renders a single page with both arrows disabled', () => {
        render(<Pagination page={1} maxPages={1} params={{}} url="games" />)

        expect(screen.getByText('1')).toBeInTheDocument()
        expect(screen.queryByLabelText('Previous page')).toBeNull()
        expect(screen.queryByLabelText('Next page')).toBeNull()
    })

    it('lists every page and no ellipsis when the total fits the window (<= 7)', () => {
        render(<Pagination page={1} maxPages={5} params={{}} url="games" />)

        expect(screen.getByText('5')).toBeInTheDocument()
        expect(screen.queryByText('…')).toBeNull()
        expect(screen.getByLabelText('Next page')).toBeInTheDocument()
        expect(screen.queryByLabelText('Previous page')).toBeNull()
    })

    it('keeps a fixed-width run near the start: 1..6 then an ellipsis then the last page', () => {
        render(<Pagination page={1} maxPages={51} params={{}} url="games" />)

        expect(screen.getByText('6')).toBeInTheDocument()
        expect(screen.queryByText('7')).toBeNull()
        expect(screen.getAllByText('…').length).toBeGreaterThanOrEqual(1)
        expect(screen.getByText('51')).toBeInTheDocument()
    })

    it('shows ellipses on both sides and marks the current page when in the middle', () => {
        render(<Pagination page={25} maxPages={51} params={{}} url="games" />)

        expect(screen.getByText('1')).toBeInTheDocument()
        expect(screen.getByText('51')).toBeInTheDocument()
        expect(screen.getAllByText('…')).toHaveLength(2)
        expect(screen.getByText('25')).toHaveAttribute('aria-current', 'page')
    })

    it('builds hrefs that preserve existing params and set the page number', () => {
        render(<Pagination page={3} maxPages={10} params={{ sort: 'rating' }} url="games" />)

        expect(screen.getByText('4')).toHaveAttribute('href', '/games?sort=rating&page=4')
        expect(screen.getByLabelText('Previous page')).toHaveAttribute('href', '/games?sort=rating&page=2')
        expect(screen.getByLabelText('Next page')).toHaveAttribute('href', '/games?sort=rating&page=4')
    })
})
