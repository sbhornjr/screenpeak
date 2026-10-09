// Spawned only by the explicitly configured disposable-Postgres suite.
import { createIgdbClient } from '../../lib/igdb/client'
import { z } from 'zod'
const clientId = process.argv[2]
const client = createIgdbClient({ clientId, auth: { getToken: async () => 'test-token' },
    fetcher: async () => {
        const id = crypto.randomUUID()
        console.log('IGDB_EVENT ' + JSON.stringify({ kind: 'start', at: Date.now(), id }))
        await new Promise(resolve => setTimeout(resolve, 1000))
        console.log('IGDB_EVENT ' + JSON.stringify({ kind: 'end', at: Date.now(), id }))
        return Response.json([])
    },
})
Promise.all(Array.from({ length: 4 }, () => client.request('games', 'fields id;', z.array(z.unknown()))))
    .then(() => process.exit(0), () => { console.error('Worker failed'); process.exit(1) })
