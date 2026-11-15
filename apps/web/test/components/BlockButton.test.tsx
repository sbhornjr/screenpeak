// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const toggleBlock = vi.fn()
const refresh = vi.fn()
vi.mock('@/app/user-actions', () => ({ toggleBlock }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const { default: BlockButton } = await import('@/app/components/user/BlockButton')
const { default: UnblockUserButton } = await import('@/app/components/settings/UnblockUserButton')

const ID = '11111111-1111-4111-8111-111111111111'

afterEach(() => {
    cleanup()
    toggleBlock.mockReset()
    refresh.mockReset()
})

describe('BlockButton', () => {
    it('asks before blocking, then blocks and refreshes', async () => {
        toggleBlock.mockResolvedValue(undefined)
        render(<BlockButton targetUserId={ID} username="rival" initialIsBlocked={false} />)

        await userEvent.click(screen.getByRole('button', { name: 'Block rival' }))
        expect(toggleBlock).not.toHaveBeenCalled()
        expect(screen.getByRole('dialog')).toBeTruthy()

        await userEvent.click(screen.getByRole('button', { name: 'Block' }))
        expect(toggleBlock).toHaveBeenCalledWith(ID, false)
        expect(refresh).toHaveBeenCalled()
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(screen.getByRole('button', { name: 'Unblock rival' })).toBeTruthy()
    })

    it('does not block when the confirm is dismissed', async () => {
        render(<BlockButton targetUserId={ID} username="rival" initialIsBlocked={false} />)

        await userEvent.click(screen.getByRole('button', { name: 'Block rival' }))
        await userEvent.keyboard('{Escape}')

        expect(screen.queryByRole('dialog')).toBeNull()
        expect(toggleBlock).not.toHaveBeenCalled()
    })

    it('unblocks straight away, with no confirm', async () => {
        toggleBlock.mockResolvedValue(undefined)
        render(<BlockButton targetUserId={ID} username="rival" initialIsBlocked={true} />)

        await userEvent.click(screen.getByRole('button', { name: 'Unblock rival' }))

        expect(screen.queryByRole('dialog')).toBeNull()
        expect(toggleBlock).toHaveBeenCalledWith(ID, true)
        expect(refresh).toHaveBeenCalled()
    })

    it('keeps the dialog open with an error when blocking fails', async () => {
        toggleBlock.mockRejectedValue(new Error('rate limited'))
        render(<BlockButton targetUserId={ID} username="rival" initialIsBlocked={false} />)

        await userEvent.click(screen.getByRole('button', { name: 'Block rival' }))
        await userEvent.click(screen.getByRole('button', { name: 'Block' }))

        expect(screen.getByRole('dialog')).toBeTruthy()
        expect(screen.getByRole('alert').textContent).toMatch(/Failed to block/)
        expect(refresh).not.toHaveBeenCalled()
    })
})

describe('UnblockUserButton', () => {
    it('unblocks with toggleBlock(id, true) and refreshes the list', async () => {
        toggleBlock.mockResolvedValue(undefined)
        render(<UnblockUserButton userId={ID} username="rival" />)

        await userEvent.click(screen.getByRole('button', { name: 'Unblock rival' }))

        expect(toggleBlock).toHaveBeenCalledWith(ID, true)
        expect(refresh).toHaveBeenCalled()
    })

    it('shows an error and does not refresh when unblocking fails', async () => {
        toggleBlock.mockRejectedValue(new Error('down'))
        render(<UnblockUserButton userId={ID} username="rival" />)

        await userEvent.click(screen.getByRole('button', { name: 'Unblock rival' }))

        expect(screen.getByRole('alert').textContent).toMatch(/Failed to unblock/)
        expect(refresh).not.toHaveBeenCalled()
    })
})
