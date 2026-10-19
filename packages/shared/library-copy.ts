// Copy both apps show for the game-page library section. Dependency-free so
// the phone bundle can import it.
import type { ViewerLibraryEntry } from './api/games'

export const LIBRARY_SECTION_TITLE = 'In your library'

export function libraryEmptyLine(signedIn: boolean): string {
    return signedIn
        ? 'Not in your library yet.'
        : 'Sign in to add this game to your library.'
}

export function libraryStatLines(
    entry: Pick<ViewerLibraryEntry, 'hours_played' | 'play_count' | 'completed_all_achievements'>,
): string[] {
    const hours = entry.hours_played == null ? '—' : String(entry.hours_played)
    return [
        `Hours played ${hours}`,
        `Times played ${entry.play_count}`,
        entry.completed_all_achievements
            ? '100% achievements completed'
            : '100% achievements not completed',
    ]
}
