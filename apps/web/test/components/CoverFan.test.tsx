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
vi.mock('next/image', async () => {
    const React = await vi.importActual<typeof import('react')>('react')
    return {
        default: ({ src, alt }: { src: string; alt: string }) => React.createElement('img', { src, alt }),
    }
})
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/app/list-actions', () => ({ toggleListPinned: vi.fn() }))
vi.mock('@/app/components/lists/LikeListButton', () => ({ default: () => null }))

import CoverFan from '@/app/components/lists/CoverFan'
import ListPreview from '@/app/components/lists/ListPreview'

const COVER = 'https://images.igdb.com/igdb/image/upload/t_thumb/co123.jpg'
const RAWG = 'https://media.rawg.io/media/games/example.jpg'

afterEach(cleanup)

const list = (coverImageUrl: string | null) => (
    <ListPreview
        listId="11111111-1111-1111-1111-111111111111"
        listName="Shelf"
        gameCovers={[{ coverImageUrl, slug: 'example' }]}
        isPinnable={false}
        isLikable={false}
        description={null}
        lastUpdated="2026-04-01 00:00:00+00"
        username="ada"
        listCount={1}
        likeCount={0}
        userHasLiked={false}
        activeUserId={undefined}
        fullLength={false}
    />
)

describe('cover fan', () => {
    it('shows the empty state when every cover url is rejected', () => {
        render(<CoverFan covers={[{ key: 'a', src: RAWG }, { key: 'b', src: 'not a url' }]} />)
        expect(screen.getByText(/no games/i)).toBeInTheDocument()
        expect(screen.queryByRole('img')).toBeNull()
    })

    it('shows the empty state on a list whose covers are not IGDB urls', () => {
        render(list(RAWG))
        expect(screen.getByText(/no games/i)).toBeInTheDocument()
        expect(screen.queryByRole('img')).toBeNull()
    })

    it('renders a displayable IGDB cover', () => {
        render(list(COVER))
        expect(screen.getByRole('img')).toHaveAttribute('src', 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co123.jpg')
    })
})
