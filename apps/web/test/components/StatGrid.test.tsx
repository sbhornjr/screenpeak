// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import StatGrid from '@/app/components/util/StatGrid'

afterEach(cleanup)

describe('StatGrid', () => {
    it('renders a cell with the value and label for each stat', () => {
        render(
            <StatGrid
                stats={[
                    { label: 'Games', value: 42 },
                    { label: 'Avg rating', value: '7.5' },
                ]}
            />,
        )

        expect(screen.getByText('42')).toBeInTheDocument()
        expect(screen.getByText('Games')).toBeInTheDocument()
        expect(screen.getByText('7.5')).toBeInTheDocument()
        expect(screen.getByText('Avg rating')).toBeInTheDocument()
    })

    it('renders exactly one cell per stat', () => {
        const { container } = render(
            <StatGrid stats={[{ label: 'A', value: 1 }, { label: 'B', value: 2 }, { label: 'C', value: 3 }]} />,
        )

        expect((container.firstChild as HTMLElement).children).toHaveLength(3)
    })

    it('appends a caller-supplied className to the grid container', () => {
        const { container } = render(<StatGrid stats={[{ label: 'A', value: 1 }]} className="mt-8" />)

        expect(container.firstChild).toHaveClass('mt-8')
    })
})
