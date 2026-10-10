export type RankedIgdbGame = { id: number; rating: number; ratingCount: number }

/** Widely rated games first. Rating, then id, breaks ties. Both inputs are required. */
export function selectTopRatedGames(candidates: RankedIgdbGame[], limit: number): RankedIgdbGame[] {
    const byId = new Map<number, RankedIgdbGame>()
    for (const row of candidates) {
        if (!Number.isInteger(row.id) || row.id <= 0) continue
        if (!Number.isFinite(row.rating) || !Number.isFinite(row.ratingCount) || row.ratingCount < 0) continue
        if (!byId.has(row.id)) byId.set(row.id, row)
    }
    return [...byId.values()]
        .sort((a, b) => b.ratingCount - a.ratingCount || b.rating - a.rating || a.id - b.id)
        .slice(0, limit)
}
