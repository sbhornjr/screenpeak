// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('next/link', async () => {
    const React = await vi.importActual<typeof import('react')>('react')
    return {
        default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
            React.createElement('a', { href, ...rest }, children),
    }
})

import Footer from '@/app/components/util/Footer'

afterEach(cleanup)

describe('Footer', () => {
    it('shows the IGDB attribution as a link', () => {
        render(<Footer />)
        const link = screen.getByRole('link', { name: 'Game data and images from IGDB' })
        expect(link).toHaveAttribute('href', 'https://www.igdb.com/')
    })
})
