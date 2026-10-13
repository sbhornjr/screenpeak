export type SeedProgress =
    | { phase: 'fetched'; from: number; to: number; total: number; count: number; ms: number }
    | { phase: 'detach'; games: number; shared: number; ms: number }
    | { phase: 'writing'; from: number; to: number; total: number }
    | { phase: 'committed'; written: number; total: number; batches: number; ms: number; statements: number }
    | { phase: 'closing-pool' }
    | { phase: 'pool-closed'; ms: number }
    | { phase: 'pool-close-forced' }

export function formatSeedProgress(event: SeedProgress): string {
    switch (event.phase) {
        case 'fetched':
            return `igdb seed: fetched ${event.count} games (${event.from}-${event.to} of ${event.total}) in ${event.ms}ms`
        case 'detach':
            return `igdb seed: detached ${event.shared} shared Steam app ids across ${event.games} games in ${event.ms}ms`
        case 'writing':
            return `igdb seed: writing games ${event.from}-${event.to} of ${event.total}`
        case 'committed':
            return `igdb seed: committed ${event.written} of ${event.total} in ${event.ms}ms (${event.statements} statements)`
        case 'closing-pool':
            return 'igdb seed: closing database pool'
        case 'pool-closed':
            return `igdb seed: database pool closed in ${event.ms}ms`
        case 'pool-close-forced':
            return 'igdb seed: database pool did not close; exiting'
    }
}
