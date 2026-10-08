// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import DistributionChart from '@/app/components/util/DistributionChart'

afterEach(cleanup)

describe('DistributionChart', () => {
    it('renders one labelled row per rating bucket', () => {
        render(
            <DistributionChart
                data={[
                    { name: 10, count: 3 },
                    { name: 9, count: 1 },
                    { name: 8, count: 0 },
                ]}
            />,
        )

        expect(screen.getByText('10')).toBeInTheDocument()
        expect(screen.getByText('9')).toBeInTheDocument()
        expect(screen.getByText('8')).toBeInTheDocument()
    })

    it('shows count and percentage of total for non-empty buckets, and "0" for empty ones', () => {
        render(
            <DistributionChart
                data={[
                    { name: 10, count: 3 },
                    { name: 9, count: 1 },
                    { name: 8, count: 0 },
                ]}
            />,
        )

        // 3 of 4 total ratings -> 75%
        expect(screen.getByText('3 · 75%')).toBeInTheDocument()
        expect(screen.getByText('1 · 25%')).toBeInTheDocument()
        expect(screen.getByText('0')).toBeInTheDocument()
    })

    it('pluralises the total-ratings caption', () => {
        const { rerender } = render(<DistributionChart data={[{ name: 10, count: 4 }]} />)
        expect(screen.getByText('4 ratings')).toBeInTheDocument()

        rerender(<DistributionChart data={[{ name: 10, count: 1 }]} />)
        expect(screen.getByText('1 rating')).toBeInTheDocument()
    })
})
