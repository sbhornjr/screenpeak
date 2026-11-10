// Copy both apps show for the game-page library section. Dependency-free so
// the phone bundle can import it.
import type { ViewerLibraryEntry } from './api/games'
import type { LibraryStatus } from './constants'

export const LIBRARY_SECTION_TITLE = 'In your library'

/** The status picker's name and line for each status. */
export const LIBRARY_STATUS_COPY: Record<LibraryStatus, { label: string, description: string }> = {
    backlog: { label: 'Backlog', description: "I'll get to it..." },
    playing: { label: 'Playing', description: 'Currently playing it' },
    completed: { label: 'Completed', description: 'Done and satisfied' },
    abandoned: { label: 'Abandoned', description: "Couldn't get into it" },
}

export function libraryEmptyLine(signedIn: boolean): string {
    return signedIn
        ? 'Not in your library yet.'
        : 'Sign in to add this game to your library.'
}

export type LibraryStatKey = 'hours' | 'plays' | 'complete'

/** A short value beside an icon, plus the icon's accessible name. */
export type LibraryStat = {
    key: LibraryStatKey
    value: string
    label: string
}

export function libraryStats(
    entry: Pick<ViewerLibraryEntry, 'hours_played' | 'play_count' | 'completed_all_achievements'>,
): LibraryStat[] {
    const hours = entry.hours_played == null ? '—' : String(entry.hours_played)
    const stats: LibraryStat[] = [
        { key: 'hours', value: hours, label: `Hours played ${hours}` },
        { key: 'plays', value: String(entry.play_count), label: `Times played ${entry.play_count}` },
    ]
    if (entry.completed_all_achievements) {
        stats.push({ key: 'complete', value: '100%', label: '100% achievements completed' })
    }
    return stats
}

/** Prominent score on the library card, such as 8/10. */
export function libraryScoreText(rating: number): string {
    return `${rating}/10`
}
