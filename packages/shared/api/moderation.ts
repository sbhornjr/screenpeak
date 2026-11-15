// POST /api/v1/reports and the website report action (reporting a review,
// list, or profile). GET /api/v1/me/blocks and the website blocked-users
// list (blocking/unblocking a user).
//
// ReportInput mirrors reportSchema's shape in packages/shared/schemas.ts, but
// is written as a plain object type rather than `z.infer` so this file stays
// zod-free, like the rest of api/* (see search.ts, lists.ts).

export type ReportInput = {
    targetType: 'review' | 'list' | 'profile'
    targetId: string
    reason: string
    details?: string
}

export type BlockedUser = {
    id: string
    username: string
    avatar_url: string | null
}

export type BlockedUsersPage = {
    users: BlockedUser[]
}
