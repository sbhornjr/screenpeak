import { createClient } from '@supabase/supabase-js'
import { seedGame, fetchGames } from '@/lib/rawg'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
)

// -------------------------------------------------------
// Main — fetch N pages and seed each game
// -------------------------------------------------------
async function main() {
    console.log('Starting seed...')

    // Games already in the DB — skip these so re-running (or resuming after
    // a crash) doesn't re-spend RAWG quota re-fetching games we already have.
    // Paginated since PostgREST caps unbounded selects at its default row limit.
    const seededRawgIds = new Set<number>()
    const PAGE_SIZE = 1000
    for (let from = 0; ; from += PAGE_SIZE) {
        const { data: existingGames } = await supabase.from('games').select('rawg_id').range(from, from + PAGE_SIZE - 1)
        for (const g of existingGames ?? []) seededRawgIds.add(g.rawg_id)
        if (!existingGames || existingGames.length < PAGE_SIZE) break
    }
    console.log(`${seededRawgIds.size} games already seeded, will be skipped`)

    for (let page = 1; page <= 3; page++) {
        console.log(`\nFetching page ${page}...`)
        const games = await fetchGames(page, undefined, 40, "60,100")

        for (const game of games) {
            if (seededRawgIds.has(game.id)) {
                console.log(`⏭ ${game.name} (already seeded)`)
                continue
            }
            await seedGame(supabase, game)
            console.log(`✓ ${game.name}`)
            seededRawgIds.add(game.id)
        }
    }

    console.log('\nDone!')
}

main()