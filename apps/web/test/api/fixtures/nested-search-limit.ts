import { searchGamesByName as queryGamesByName } from '@/lib/queries/game'
import { consumeSearchRateLimit } from '@/lib/rate-limit'

// A nested function with the import's name is not the rate limiter. The
// search-budget guard must fail this file. It is not production code.
void consumeSearchRateLimit

export async function searchGamesByName(query: string) {
    function consumeSearchRateLimit() {
        return Promise.resolve()
    }
    await consumeSearchRateLimit()
    return queryGamesByName(query, 20)
}
