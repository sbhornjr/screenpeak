// Fixture rows and SQL helpers that more than one drive uses.
import { adaEmail, adaUsername, databaseUrl, gatewayPort, novaEmail, peekEmail, peekPassword, peekUsername } from './config.mjs'
import { psql } from './database.mjs'
import { log } from './runtime.mjs'

export function assertUuid(value, label) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        throw new Error(`${label} is not a uuid: ${value}`)
    }
    return value
}

export function peekWriteTarget() {
    const line = psql(databaseUrl, `
        select g.id::text || '|' || g.slug || '|' || g.name || '|' || rr.rating::text
            || '|' || encode(convert_to(coalesce(rr.review, ''), 'UTF8'), 'base64')
            || '|' || le.status
            || '|' || coalesce(le.hours_played::text, '')
            || '|' || coalesce(le.play_count::text, '')
            || '|' || coalesce(le.completed_all_achievements::text, '')
            || '|' || u.id::text
        from games g
        join ratings_reviews rr on rr.game_id = g.id
        join library_entries le on le.game_id = g.id and le.user_id = rr.user_id
        join users u on u.id = rr.user_id
        where u.username = '${peekUsername}'
        order by g.slug
        limit 1
    `, ['-tA'])
    if (!line) throw new Error('peek has no rated library game to write.')
    const [gameId, slug, name, rating, reviewB64, status, hours, playCount, completed, userId] = line.split('|')
    const allowed = ['playing', 'completed', 'backlog', 'abandoned']
    if (!allowed.includes(status)) throw new Error(`unexpected library status ${status}`)
    return {
        gameId: assertUuid(gameId, 'gameId'),
        slug,
        name,
        rating: Number(rating),
        reviewB64,
        status,
        hours,
        playCount,
        completed,
        userId: assertUuid(userId, 'userId'),
    }
}

export function peekCounts() {
    const line = psql(databaseUrl, `
        select (select count(*) from ratings_reviews rr join users u on u.id = rr.user_id where u.username = '${peekUsername}')
            || '|' ||
            (select count(*) from library_entries le join users u on u.id = le.user_id where u.username = '${peekUsername}')
    `, ['-tA'])
    const [ratings, library] = line.split('|').map(Number)
    return { ratings, library }
}

export function restorePeekWrites(target) {
    const completed = target.completed === '' ? 'null' : target.completed === 't' || target.completed === 'true' ? 'true' : 'false'
    psql(databaseUrl, `
        update ratings_reviews
        set rating = ${target.rating},
            review = convert_from(decode('${target.reviewB64}', 'base64'), 'UTF8')
        where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid;
        update library_entries
        set status = '${target.status}',
            hours_played = ${target.hours === '' ? 'null' : target.hours},
            play_count = ${target.playCount === '' ? 'null' : target.playCount},
            completed_all_achievements = ${completed}
        where user_id = '${target.userId}'::uuid and game_id = '${target.gameId}'::uuid;
    `)
}

export async function peekAccessToken() {
    const res = await fetch(`http://127.0.0.1:${gatewayPort}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: 'verify-screenpeak' },
        body: JSON.stringify({ email: peekEmail, password: peekPassword }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok || !body?.access_token) throw new Error(`password grant failed (${res.status})`)
    return body.access_token
}

export function insertPrivateAda() {
    psql(databaseUrl, `
        INSERT INTO auth.users (id, email, raw_user_meta_data)
        SELECT gen_random_uuid(), '${adaEmail}', '{"username":"${adaUsername}"}'::jsonb
        WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = '${adaEmail}');
        UPDATE public.users
        SET username = '${adaUsername}',
            display_name = '${adaUsername}',
            library_public = false,
            loadout_public = false
        WHERE id = (SELECT id FROM auth.users WHERE email = '${adaEmail}');
    `)
}

export function deleteAda() {
    try {
        psql(databaseUrl, `DELETE FROM auth.users WHERE email = '${adaEmail}';`)
    } catch (error) {
        log(error instanceof Error ? error.message : String(error))
    }
}

export function deleteNova() {
    try {
        psql(databaseUrl, `DELETE FROM auth.users WHERE email = '${novaEmail}';`)
    } catch (error) {
        log(error instanceof Error ? error.message : String(error))
    }
}

export function sqlLiteral(value) {
    return `'${String(value).replace(/'/g, "''")}'`
}

export function sqlNullable(value) {
    return value === '' ? 'NULL' : sqlLiteral(value)
}

export function peekLibraryGames() {
    const text = psql(databaseUrl, `
        select g.id::text || E'\\t' || replace(g.name, E'\\t', ' ')
        from library_entries le
        join users u on u.id = le.user_id
        join games g on g.id = le.game_id
        where u.username = '${peekUsername}'
        order by g.name
        limit 2
    `, ['-tA'])
    return text.split('\n').filter(Boolean).map((line) => {
        const [id, name] = line.split('\t')
        return { id, name }
    })
}
