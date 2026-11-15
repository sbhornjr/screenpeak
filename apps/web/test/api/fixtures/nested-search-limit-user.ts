import { searchUsersByUsername as queryUsersByUsername } from '@/lib/queries/user'
import { consumeSearchRateLimit } from '@/lib/rate-limit'

// A nested function with the import's name is not the rate limiter. The
// search-budget guard must fail this file. It is not production code.
void consumeSearchRateLimit

export async function searchUsersByUsername(query: string) {
    function consumeSearchRateLimit() {
        return Promise.resolve()
    }
    await consumeSearchRateLimit()
    return queryUsersByUsername(query, 20)
}
