import { z } from 'zod'
import { SEARCH_MAX_PAGE_SIZE, SEARCH_QUERY_MAX_LENGTH, TAXONOMY_SEARCH_ID_CAP, TAXONOMY_SEARCH_TABLES } from './constants'

// Shared field schemas — the single source of truth for input shape rules,
// used both by lib/queries/* (server-side-of-the-call defense) and by the
// forms that call them (immediate UX feedback). These run in the browser
// bundle when called from a client component, so they are not a substitute
// for RLS/DB constraints against a caller who bypasses the app entirely —
// see the CHECK constraints migration for that layer.

export const emailSchema = z.string().trim().min(1, 'Email is required').email('Enter a valid email address')

export const passwordSchema = z.string().min(8, 'Password must be at least 8 characters')

export const usernameSchema = z.string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be 20 characters or fewer')
    .regex(/^[a-zA-Z0-9_]+$/, 'Usernames can only contain letters, numbers, and underscores')

export const ratingReviewSchema = z.object({
    rating: z.coerce.number()
        .int('Rating must be a whole number')
        .min(1, 'Rating must be between 1 and 10')
        .max(10, 'Rating must be between 1 and 10'),
    // Empty string is valid on purpose — it means "rated, no written review".
    review: z.string().max(5000, 'Reviews are limited to 5000 characters'),
})

export const listFieldsSchema = z.object({
    name: z.string().trim().min(1, 'Give the list a name').max(80, 'List names are limited to 80 characters'),
    description: z.string().max(500, 'Descriptions are limited to 500 characters'),
    isPublic: z.boolean(),
    isPinned: z.boolean(),
})

export const bioSchema = z.string().max(500, 'Bio is limited to 500 characters')

// Titles are computed per-user from stats (lib/titles.ts: genre titles plus
// dynamic "#1 <game/developer> Fan" entries), not a fixed static list — so
// this only bounds shape/length. It can't verify the submitted title is one
// this specific user actually earned without recomputing their stats
// server-side; that's a real gap but a bigger one than input validation.
export const selectedTitleSchema = z.string().trim().min(1, 'Pick a title').max(100, 'That title is too long')

export const favoriteGameIdsSchema = z.array(z.string().min(1)).max(5, 'You can only select 5 favorite games')

export const privacyTypeSchema = z.enum(['Default List', 'Library', 'Loadout'])

/** Account, game, and list ids on `/api/v1` are uuid strings. */
export const uuidIdSchema = z.uuid('Must be a uuid.')

export const libraryStatusSchema = z.enum(['playing', 'completed', 'backlog', 'abandoned'])

/** numeric(8,1): one decimal place, at most 9999999.9. */
const hoursPlayedSchema = z.number()
    .finite('Hours must be a finite number')
    .min(0, 'Hours cannot be negative')
    .max(9999999.9, 'Hours cannot exceed 9999999.9')
    .refine((value) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-6, 'Hours can have at most one decimal place')

/** PUT /api/v1/me/library/[gameId]. Status is required. Omitted fields stay as stored on an existing row. */
export const libraryEntryWriteSchema = z.object({
    status: libraryStatusSchema,
    completed_all_achievements: z.boolean().optional(),
    hours_played: hoursPlayedSchema.nullable().optional(),
    play_count: z.number().int('Play count must be a whole number').min(0, 'Play count cannot be negative').max(32767, 'Play count cannot exceed 32767').optional(),
})

/** POST /api/v1/lists. `gameId` creates the list and adds that game in one call. */
export const createListSchema = listFieldsSchema.extend({
    gameId: uuidIdSchema.optional(),
})

/** PATCH /api/v1/lists/[listId] when the body only changes the pin. */
export const listPinSchema = z.object({
    isPinned: z.boolean(),
}).strict()

export const listGameSyncSchema = z.object({
    toAdd: z.array(z.object({ id: uuidIdSchema })).max(500),
    toRemove: z.array(z.object({ id: uuidIdSchema })).max(500),
})

export const patchMeSchema = z.object({
    username: usernameSchema.optional(),
    bio: bioSchema.optional(),
    selectedTitle: selectedTitleSchema.optional(),
    loadoutBio: bioSchema.optional(),
    favoriteGames: z.array(uuidIdSchema).max(5, 'You can only select 5 favorite games').optional(),
    privacy: z.object({
        type: privacyTypeSchema,
        public: z.boolean(),
    }).optional(),
}).refine(value => Object.values(value).some(item => item !== undefined), {
    message: 'Nothing to update.',
})

export const avatarUploadSchema = z.object({
    contentType: z.string().min(1, 'Choose an image type.'),
    contentLength: z.number().int().positive('Image size is required.'),
})

export const avatarUrlSchema = z.object({
    url: z.url('Enter the uploaded image URL.'),
})

/** GET /api/v1/games/search and the website game-name search action. */
export const gameSearchSchema = z.object({
    q: z.string().trim().min(1, 'Enter a search.').max(SEARCH_QUERY_MAX_LENGTH, `Search is limited to ${SEARCH_QUERY_MAX_LENGTH} characters.`),
    limit: z.coerce.number().int('`limit` must be a whole number.').min(1, '`limit` must be at least 1.').max(SEARCH_MAX_PAGE_SIZE, `\`limit\` cannot exceed ${SEARCH_MAX_PAGE_SIZE}.`).default(SEARCH_MAX_PAGE_SIZE),
})

export const taxonomyTableSchema = z.enum(TAXONOMY_SEARCH_TABLES)

/** GET /api/v1/taxonomy/[table]/search. `ids` limits the match to those rows. */
export const taxonomySearchSchema = gameSearchSchema.extend({
    table: taxonomyTableSchema,
    ids: z.array(uuidIdSchema).max(TAXONOMY_SEARCH_ID_CAP, `At most ${TAXONOMY_SEARCH_ID_CAP} ids.`).optional(),
})

export const taxonomySlugSchema = z.string().trim().min(1, 'Enter a slug.').max(120, 'That slug is too long.')

/**
 * The website action forwards the whole selection in one call and has no row
 * cap. This schema matches that: `upsertLibraryEntries` writes the selection
 * in one statement, so clients do not chunk.
 */
const pkceChallengeSchema = z.string().regex(/^[A-Za-z0-9_-]{43,128}$/, 'Invalid code challenge')
const pkceVerifierSchema = z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/, 'Invalid code verifier')

/** POST /api/v1/me/steam/link-intent. The S256 challenge only. No redirect and no user id. */
export const steamLinkIntentSchema = z.object({
    codeChallenge: pkceChallengeSchema,
}).strict()

/** POST /api/v1/me/steam/link-complete. The one-time code plus the PKCE verifier. */
export const steamLinkCompleteSchema = z.object({
    code: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/, 'Invalid link code'),
    verifier: pkceVerifierSchema,
}).strict()

const STEAM_APP_ID_MAX = 2_147_483_647

/** POST /api/v1/me/steam/import. Owned app ids stay on the server. */
export const steamImportBatchSchema = z.object({
    retry: z.boolean().optional(),
    cursor: z.object({
        phase: z.enum(['pending', 'miss']),
        afterAppId: z.number().int().min(0).max(STEAM_APP_ID_MAX),
    }).strict().nullable().optional(),
}).strict()

export const steamLibraryImportSchema = z.array(z.object({
    gameId: uuidIdSchema,
    playtimeSelected: hoursPlayedSchema,
    status: libraryStatusSchema,
    selected: z.boolean(),
    coverImageUrl: z.string().nullable(),
    gameName: z.string(),
    gameDeveloper: z.string(),
    gameReleased: z.string().nullable(),
    timesPlayed: z.number().int().optional(),
    completedAllAchievements: z.boolean(),
    steamPlaytimeMinutes: z.number().int().nullable().optional(),
}))

// Runs a schema and collapses the result to a single message, so every query
// function can return the same { data, error } shape regardless of whether
// the failure came from validation or from Supabase. `success` is the
// discriminant — check it (not truthiness of `data`/`error`) so TypeScript
// can narrow which branch you're in.
export function parseOrError<T>(
    schema: z.ZodType<T>,
    value: unknown,
): { success: true, data: T, error: null } | { success: false, data: null, error: string } {
    const result = schema.safeParse(value)
    if (result.success) return { success: true, data: result.data, error: null }
    return { success: false, data: null, error: result.error.issues[0]?.message ?? 'Invalid input' }
}
