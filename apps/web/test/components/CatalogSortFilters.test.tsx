// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GameFilters from '@/app/components/game/GameFilters'
import LibraryFilters from '@/app/components/library/LibraryFilters'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

afterEach(() => {
    cleanup()
    push.mockReset()
})

function paramsOf(call: string) {
    return new URL(call, 'http://localhost').searchParams
}

function sortSelect() {
    const select = screen.getAllByRole('combobox').find(element =>
        [...element.querySelectorAll('option')].some(option => option.value === 'ngplus_rating'))
    if (!select) throw new Error('Sort select was not rendered')
    return select
}

describe('catalogue sort controls', () => {
    it('switches the games page from name ascending to a score sort descending', async () => {
        render(<GameFilters
            current={{ query: '', genre: '', platform: '', developer: '', publisher: '', esrb: '', pageSize: '10', sort: 'name', order: 'asc' }}
            genres={[]}
            platforms={[]}
            esrb_ratings={[]}
        />)

        await userEvent.selectOptions(sortSelect(), 'ngplus_rating')

        const params = paramsOf(push.mock.calls[0][0])
        expect(push.mock.calls[0][0]).toMatch(/^\/games\?/)
        expect(params.get('sort')).toBe('ngplus_rating')
        expect(params.get('order')).toBe('desc')
    })

    it('switches a library from name ascending to date and score sorts descending', async () => {
        const current = { query: '', genre: '', platform: '', developer: '', publisher: '', esrb: '', sort: 'name', order: 'asc', status: '', is100: '' }
        const lists = { genres: [], platforms: [], esrb_ratings: [], username: 'ada' }
        const user = userEvent.setup()
        const { unmount } = render(<LibraryFilters current={current} {...lists} />)

        await user.selectOptions(sortSelect(), 'date_added')
        expect(paramsOf(push.mock.calls[0][0]).get('sort')).toBe('date_added')
        expect(paramsOf(push.mock.calls[0][0]).get('order')).toBe('desc')
        expect(push.mock.calls[0][0]).toMatch(/^\/user\/ada\/library\?/)

        unmount()
        push.mockReset()
        render(<LibraryFilters current={current} {...lists} />)
        await user.selectOptions(sortSelect(), 'your_rating')
        expect(paramsOf(push.mock.calls[0][0]).get('sort')).toBe('your_rating')
        expect(paramsOf(push.mock.calls[0][0]).get('order')).toBe('desc')
    })
})
