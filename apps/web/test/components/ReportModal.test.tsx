// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { REPORT_REASONS } from '@screenpeak/shared/constants'

const submitReport = vi.fn()
vi.mock('@/app/report-actions', () => ({ submitReport }))

const { default: ReportModal, ReportButton } = await import('@/app/components/util/ReportModal')

const ID = '11111111-1111-4111-8111-111111111111'

afterEach(() => {
    cleanup()
    submitReport.mockReset()
})

describe('ReportModal', () => {
    it.each(['review', 'list', 'profile'] as const)('offers exactly REPORT_REASONS.%s, ending in Other', (targetType) => {
        render(<ReportModal targetType={targetType} targetId={ID} onClose={() => {}} />)

        const options = [...screen.getByLabelText('Reason').querySelectorAll('option')].map(o => o.value)
        expect(options).toEqual([...REPORT_REASONS[targetType]])
        expect(options.at(-1)).toBe('Other')
        expect(screen.getByLabelText('Details (optional)').tagName).toBe('TEXTAREA')
    })

    it('submits the target, reason, and trimmed details, then shows a confirmation instead of closing', async () => {
        submitReport.mockResolvedValue({ error: null })
        const onClose = vi.fn()
        render(<ReportModal targetType="review" targetId={ID} onClose={onClose} />)

        await userEvent.selectOptions(screen.getByLabelText('Reason'), 'Spam')
        await userEvent.type(screen.getByLabelText('Details (optional)'), '  buy gold  ')
        await userEvent.click(screen.getByRole('button', { name: 'Report' }))

        expect(submitReport).toHaveBeenCalledWith({ targetType: 'review', targetId: ID, reason: 'Spam', details: 'buy gold' })
        expect(await screen.findByRole('heading', { name: 'Reported' })).toBeTruthy()
        expect(screen.queryByLabelText('Reason')).toBeNull()
        expect(onClose).not.toHaveBeenCalled()

        await userEvent.click(screen.getByRole('button', { name: 'Done' }))
        expect(onClose).toHaveBeenCalled()
    })

    it('omits empty details', async () => {
        submitReport.mockResolvedValue({ error: null })
        render(<ReportModal targetType="list" targetId={ID} onClose={() => {}} />)

        await userEvent.click(screen.getByRole('button', { name: 'Report' }))

        expect(submitReport).toHaveBeenCalledWith({ targetType: 'list', targetId: ID, reason: REPORT_REASONS.list[0] })
    })

    it('disables the Report button while a submit is in flight', async () => {
        let resolve!: (v: { error: string | null }) => void
        submitReport.mockReturnValue(new Promise(r => { resolve = r }))
        render(<ReportModal targetType="profile" targetId={ID} onClose={() => {}} />)

        await userEvent.click(screen.getByRole('button', { name: 'Report' }))

        const busy = screen.getByRole('button', { name: 'Reporting…' }) as HTMLButtonElement
        expect(busy.disabled).toBe(true)
        resolve({ error: null })
        expect(await screen.findByRole('heading', { name: 'Reported' })).toBeTruthy()
    })

    it('keeps the form and shows the error the action returns', async () => {
        submitReport.mockResolvedValue({ error: 'Not found.' })
        render(<ReportModal targetType="review" targetId={ID} onClose={() => {}} />)

        await userEvent.click(screen.getByRole('button', { name: 'Report' }))

        expect((await screen.findByRole('alert')).textContent).toBe('Not found.')
        expect(screen.getByLabelText('Reason')).toBeTruthy()
    })

    it('shows a generic error when the action throws (rate limit, signed out, outage)', async () => {
        submitReport.mockRejectedValue(new Error('rate_limited'))
        render(<ReportModal targetType="review" targetId={ID} onClose={() => {}} />)

        await userEvent.click(screen.getByRole('button', { name: 'Report' }))

        expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn't send this report/)
    })
})

describe('ReportButton', () => {
    it('is a flag titled Report that opens the modal for its target', async () => {
        submitReport.mockResolvedValue({ error: null })
        render(<ReportButton targetType="profile" targetId={ID} />)

        const trigger = screen.getByRole('button', { name: 'Report profile' })
        expect(trigger.getAttribute('title')).toBe('Report')
        await userEvent.click(trigger)
        await userEvent.click(screen.getByRole('button', { name: 'Report' }))

        expect(submitReport).toHaveBeenCalledWith(expect.objectContaining({ targetType: 'profile', targetId: ID }))
    })
})
