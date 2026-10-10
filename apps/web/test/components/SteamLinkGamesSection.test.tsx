// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SteamLinkEntry } from '@screenpeak/shared/types'

const { resolveSteamImportBatch, importSteamLibraryEntries } = vi.hoisted(() => ({
    resolveSteamImportBatch: vi.fn(),
    importSteamLibraryEntries: vi.fn(),
}))
vi.mock('@/app/steam-actions', () => ({ resolveSteamImportBatch }))
vi.mock('@/app/library-actions', () => ({ importSteamLibraryEntries }))
vi.mock('next/image', () => ({
    // jsdom stub. The real optimizer is not under test here.
    default: (props: { alt: string }) => <img alt={props.alt} />, // eslint-disable-line @next/next/no-img-element
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import SteamLinkGamesSection from '@/app/components/settings/SteamLinkGamesSection'

const entry = (patch: Partial<SteamLinkEntry> = {}): SteamLinkEntry => ({
    gameId: '11111111-1111-4111-8111-111111111111',
    playtimeSelected: 2,
    status: 'playing',
    selected: true,
    coverImageUrl: null,
    gameName: 'Hades',
    gameDeveloper: 'Supergiant',
    gameReleased: '2020-09-17',
    timesPlayed: 1,
    completedAllAchievements: false,
    ...patch,
})

afterEach(() => {
    cleanup()
    resolveSteamImportBatch.mockReset()
    importSteamLibraryEntries.mockReset()
})

describe('SteamLinkGamesSection', () => {
    it('shows summed hours and does not match when every owned app is already local', () => {
        render(<SteamLinkGamesSection initialEntries={[entry()]} totalApps={2} pending={0} unmatched={0} ambiguous={0} />)
        expect(screen.getByLabelText('Hours Played')).toHaveValue(2)
        expect(screen.getByRole('status')).toHaveTextContent('1 game ready')
        expect(resolveSteamImportBatch).not.toHaveBeenCalled()
    })

    it('keeps an edited hour value and reports unmatched apps separately from games', async () => {
        const user = userEvent.setup()
        resolveSteamImportBatch.mockResolvedValue({
            entries: [entry({ playtimeSelected: 9, completedAllAchievements: true })],
            remaining: 0,
            totalApps: 3,
            matchedGameCount: 1,
            unmatchedAppCount: 2,
            ambiguousAppCount: 0,
            retryableAppCount: 0,
        })
        render(<SteamLinkGamesSection initialEntries={[entry()]} totalApps={3} pending={1} unmatched={0} ambiguous={0} />)
        const hours = screen.getByLabelText('Hours Played')
        await user.clear(hours)
        await user.type(hours, '6')
        expect(await screen.findByText(/2 Steam apps could not be matched/)).toBeInTheDocument()
        expect(screen.getByLabelText('Hours Played')).toHaveValue(6)
        expect(screen.getByRole('button', { name: /Import Games \(1\)/ })).toBeEnabled()
    })

    it('updates hours from a later batch unless that field was edited', async () => {
        const user = userEvent.setup()
        const later = entry({ gameId: '22222222-2222-4222-8222-222222222222', gameName: 'Hades II', playtimeSelected: 4 })
        let resolveSecond: (value: unknown) => void = () => {}
        resolveSteamImportBatch
            .mockResolvedValueOnce({
                entries: [entry({ playtimeSelected: 1 })],
                remaining: 1,
                totalApps: 2,
                matchedGameCount: 1,
                unmatchedAppCount: 0,
                ambiguousAppCount: 0,
                retryableAppCount: 0,
                nextCursor: { phase: 'pending', afterAppId: 11 },
            })
            .mockImplementationOnce(() => new Promise(resolve => { resolveSecond = resolve }))
        render(<SteamLinkGamesSection initialEntries={[]} totalApps={2} pending={2} unmatched={0} ambiguous={0} />)
        const hours = await screen.findByLabelText('Hours Played')
        expect(hours).toHaveValue(1)
        await user.clear(hours)
        await user.type(hours, '6')
        resolveSecond({
            entries: [entry({ playtimeSelected: 3 }), later],
            remaining: 0,
            totalApps: 2,
            matchedGameCount: 2,
            unmatchedAppCount: 0,
            ambiguousAppCount: 0,
            retryableAppCount: 0,
            nextCursor: null,
        })
        expect(await screen.findByText('Hades II')).toBeInTheDocument()
        const fields = screen.getAllByLabelText('Hours Played')
        expect(fields[0]).toHaveValue(6)
        expect(fields[1]).toHaveValue(4)
    })

    it('walks a retry cursor instead of asking for the same batch again', async () => {
        const user = userEvent.setup()
        resolveSteamImportBatch
            .mockResolvedValueOnce({
                entries: [entry()],
                remaining: 4,
                totalApps: 5,
                matchedGameCount: 1,
                unmatchedAppCount: 0,
                ambiguousAppCount: 0,
                retryableAppCount: 4,
                nextCursor: null,
            })
            .mockResolvedValueOnce({
                entries: [entry()],
                remaining: 20,
                totalApps: 70,
                matchedGameCount: 1,
                unmatchedAppCount: 0,
                ambiguousAppCount: 0,
                retryableAppCount: 0,
                nextCursor: { phase: 'miss', afterAppId: 50 },
            })
            .mockResolvedValueOnce({
                entries: [entry()],
                remaining: 0,
                totalApps: 70,
                matchedGameCount: 1,
                unmatchedAppCount: 0,
                ambiguousAppCount: 0,
                retryableAppCount: 0,
                nextCursor: null,
            })
        render(<SteamLinkGamesSection initialEntries={[entry()]} totalApps={5} pending={4} unmatched={0} ambiguous={0} />)
        await user.click(await screen.findByRole('button', { name: /Try the remaining matches again/ }))
        await waitFor(() => expect(resolveSteamImportBatch).toHaveBeenCalledTimes(3))
        expect(resolveSteamImportBatch).toHaveBeenNthCalledWith(1, {})
        expect(resolveSteamImportBatch).toHaveBeenNthCalledWith(2, { retry: true, cursor: null })
        expect(resolveSteamImportBatch).toHaveBeenNthCalledWith(3, { retry: true, cursor: { phase: 'miss', afterAppId: 50 } })
        expect(screen.getByRole('status')).not.toHaveTextContent('still to check')
    })

    it('shows a retry when the provider fails and keeps the games already matched', async () => {
        resolveSteamImportBatch.mockResolvedValue({
            entries: [entry()],
            remaining: 4,
            totalApps: 5,
            matchedGameCount: 1,
            unmatchedAppCount: 0,
            ambiguousAppCount: 0,
            retryableAppCount: 4,
        })
        render(<SteamLinkGamesSection initialEntries={[entry()]} totalApps={5} pending={4} unmatched={0} ambiguous={0} />)
        expect(await screen.findByRole('button', { name: /Try the remaining matches again/ })).toBeInTheDocument()
        expect(screen.getByText('Hades')).toBeInTheDocument()
    })
})
