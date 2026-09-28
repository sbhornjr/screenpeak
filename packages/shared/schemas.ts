import { z } from 'zod'

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
