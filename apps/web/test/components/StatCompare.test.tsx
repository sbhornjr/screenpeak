// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import StatCompare from '@/app/components/game/StatCompare'

afterEach(cleanup)

function labels() {
    return screen.getAllByTestId('score-label').map(node => node.textContent?.replace(/\s+/g, '').trim())
}

function renderScores(props: Parameters<typeof StatCompare>[0]) {
    return render(<StatCompare {...props} />)
}

describe('StatCompare', () => {
    it('shows exactly You and Community, both on /10, with the community count', () => {
        renderScores({ signedIn: true, you: 9, community: 7.5, communityCount: 4 })

        expect(labels()).toEqual(['You', 'Community'])
        expect(screen.getByTestId('score-you')).toHaveTextContent('/ 10')
        expect(screen.getByTestId('score-community')).toHaveTextContent('/ 10 · 4')
        expect(screen.getByTestId('score-you')).toHaveTextContent('9')
        expect(screen.getByTestId('score-community')).toHaveTextContent('7.5')
        expect(screen.queryByText(/Critic|Following|Metacritic/i)).not.toBeInTheDocument()
        expect(screen.getByTestId('score-gap')).toHaveTextContent('1.5 above')
    })

    it('signed out: You is a dash and a sign-in prompt, never another rating', () => {
        renderScores({ signedIn: false, you: null, community: 8, communityCount: 3 })

        expect(screen.getByTestId('score-you')).toHaveTextContent('—')
        expect(screen.getByTestId('score-you')).toHaveTextContent('sign in to rate')
        expect(screen.getByTestId('score-you')).not.toHaveTextContent('8')
        expect(screen.getByTestId('score-gap')).toHaveTextContent('Sign in to add your rating')
    })

    it('signed in and unrated: You is a dash, and a community score invites a rating', () => {
        renderScores({ signedIn: true, you: null, community: 8, communityCount: 3 })

        expect(screen.getByTestId('score-you')).toHaveTextContent('not scored')
        expect(screen.getByTestId('score-gap')).toHaveTextContent('Add your rating')
    })

    it('shows an em dash and "No ratings yet" when the community has no ratings, never zero', () => {
        renderScores({ signedIn: true, you: null, community: null, communityCount: 0 })

        expect(screen.getByTestId('score-community')).toHaveTextContent('—')
        expect(screen.getByTestId('score-community')).toHaveTextContent('No ratings yet')
        expect(screen.getByTestId('score-community')).not.toHaveTextContent('0')
        expect(screen.getByTestId('score-gap')).toHaveTextContent('Be the first to rate it')
    })

    it('treats a literal zero as a missing score', () => {
        renderScores({ signedIn: true, you: 0, community: 0, communityCount: 0 })

        expect(screen.getByTestId('score-you')).toHaveTextContent('—')
        expect(screen.getByTestId('score-community')).toHaveTextContent('—')
        expect(screen.queryByText(/^0$/)).not.toBeInTheDocument()
    })

    it('one community rating that is the viewer is first on the board, not a gap', () => {
        renderScores({ signedIn: true, you: 8, community: 8, communityCount: 1 })

        expect(screen.getByTestId('score-community')).toHaveTextContent('/ 10 · 1')
        expect(screen.getByTestId('score-gap')).toHaveTextContent('first on the board')
        expect(screen.getByTestId('score-gap')).not.toHaveTextContent('above')
    })

    it('does not call a lone personal score the first rating when the aggregate is missing', () => {
        renderScores({ signedIn: true, you: 8, community: null, communityCount: 0 })

        expect(screen.getByTestId('score-you')).toHaveTextContent('8')
        expect(screen.queryByTestId('score-gap')).not.toBeInTheDocument()
        expect(screen.queryByText(/first on the board/i)).not.toBeInTheDocument()
    })

    it('states the gap only when both scores exist and more than one person has rated', () => {
        renderScores({ signedIn: true, you: 6, community: 8.2, communityCount: 5 })

        expect(screen.getByTestId('score-gap')).toHaveTextContent('2.2 below')
    })
})
