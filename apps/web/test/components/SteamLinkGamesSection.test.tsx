// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SteamLinkEntry } from '@screenpeak/shared/types'

const { resolveSteamImportBatch, importSteamLibraryEntries } = vi.hoisted(() => ({
    resolveSteamImportBatch: vi.fn(),
    importSteamLibraryEntries: vi.fn(),
}))
vi.mock('@/app/steam-actions', () => ({ resolveSteamImportBatch }))
vi.mock('@/app/library-actions', () => ({ importSteamLibraryEntries }))
vi.mock('next/image', () => ({ default: (props: { alt: string }) => <img alt={props.alt} /> }))
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
