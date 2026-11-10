import { pgTable, pgSchema, unique, pgPolicy, uuid, integer, text, timestamp, date, foreignKey, check, boolean, numeric, smallint, primaryKey, index, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// Reference-only stub for the auth schema Supabase provisions and owns.
// Not part of our migrations — exists so the users.id FK has a target.
const authSchema = pgSchema("auth")
export const usersInAuth = authSchema.table("users", {
	id: uuid().primaryKey(),
})


export const genres = pgTable("genres", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	igdbId: integer("igdb_id").notNull(),
	providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true, mode: 'string' }),
	name: text().notNull(),
	slug: text().notNull(),
}, (table) => [
	unique("genres_igdb_id_key").on(table.igdbId),
	unique("genres_slug_key").on(table.slug),
	check("genres_igdb_id_positive", sql`${table.igdbId} > 0`),
	pgPolicy("Public read access", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
])

export const platforms = pgTable("platforms", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	igdbId: integer("igdb_id").notNull(),
	providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true, mode: 'string' }),
	name: text().notNull(),
	slug: text().notNull(),
}, (table) => [
	unique("platforms_igdb_id_key").on(table.igdbId),
	unique("platforms_slug_key").on(table.slug),
	check("platforms_igdb_id_positive", sql`${table.igdbId} > 0`),
	pgPolicy("Public read access", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
])

export const developers = pgTable("developers", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	igdbId: integer("igdb_id").notNull(),
	providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true, mode: 'string' }),
	name: text().notNull(),
	slug: text().notNull(),
}, (table) => [
	unique("developers_igdb_id_key").on(table.igdbId),
	unique("developers_slug_key").on(table.slug),
	check("developers_igdb_id_positive", sql`${table.igdbId} > 0`),
	pgPolicy("Public read access", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
])

export const games = pgTable("games", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	igdbId: integer("igdb_id").notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	coverImageUrl: text("cover_image_url"),
	released: date(),
	description: text(),
	esrbRating: text("esrb_rating"),
	redditUrl: text("reddit_url"),
	screenshots: text().array(),
	gameType: integer("game_type"),
	artworkImageUrl: text("artwork_image_url"),
	providerSlug: text("provider_slug"),
	providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true, mode: 'string' }),
	metadataSyncedAt: timestamp("metadata_synced_at", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [
	unique("games_igdb_id_key").on(table.igdbId),
	check("games_igdb_id_positive", sql`${table.igdbId} > 0`),
	unique("games_slug_key").on(table.slug),
	pgPolicy("Public read access", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
])

export const publishers = pgTable("publishers", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	igdbId: integer("igdb_id").notNull(),
	providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true, mode: 'string' }),
	name: text().notNull(),
	slug: text().notNull(),
}, (table) => [
	unique("publishers_igdb_id_key").on(table.igdbId),
	unique("publishers_slug_key").on(table.slug),
	check("publishers_igdb_id_positive", sql`${table.igdbId} > 0`),
	pgPolicy("Public read access", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
])

export const ratingsReviews = pgTable("ratings_reviews", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	gameId: uuid("game_id").notNull(),
	rating: integer().notNull(),
	review: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.gameId],
			foreignColumns: [games.id],
			name: "ratings_reviews_game_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "ratings_reviews_user_id_fkey"
		}).onDelete("cascade"),
	unique("ratings_reviews_user_id_game_id_key").on(table.userId, table.gameId),
	pgPolicy("Public read access", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
	pgPolicy("Users can delete own ratings and reviews", { as: "permissive", for: "delete", to: ["authenticated"], using: sql`(auth.uid() = user_id)` }),
	pgPolicy("Users can insert own ratings and reviews", { as: "permissive", for: "insert", to: ["authenticated"], withCheck: sql`(auth.uid() = user_id)` }),
	pgPolicy("Users can update own ratings and reviews", { as: "permissive", for: "update", to: ["authenticated"], using: sql`(auth.uid() = user_id)`, withCheck: sql`(auth.uid() = user_id)` }),
	check("rating_range", sql`(rating >= 1) AND (rating <= 10)`),
	check("review_length", sql`char_length(COALESCE(review, ''::text)) <= 5000`),
])

export const libraryEntries = pgTable("library_entries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	gameId: uuid("game_id").notNull(),
	status: text().default('backlog').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	completedAllAchievements: boolean("completed_all_achievements").default(false),
	hoursPlayed: numeric("hours_played", { precision: 8, scale:  1 }),
	playCount: smallint("play_count").default(1),
	startDate: date("start_date"),
	finishDate: date("finish_date"),
	source: text().default('manual').notNull(),
	steamPlaytimeMinutes: integer("steam_playtime_minutes"),
}, (table) => [
	foreignKey({
			columns: [table.gameId],
			foreignColumns: [games.id],
			name: "library_entries_game_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "library_entries_user_id_fkey"
		}).onDelete("cascade"),
	unique("library_entries_user_id_game_id_key").on(table.userId, table.gameId),
	pgPolicy("Public read access", { as: "permissive", for: "select", to: ["public"], using: sql`((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = library_entries.user_id) AND COALESCE(u.library_public, false)))))` }),
	pgPolicy("Users can delete own library entries", { as: "permissive", for: "delete", to: ["authenticated"], using: sql`(auth.uid() = user_id)` }),
	pgPolicy("Users can insert own library", { as: "permissive", for: "insert", to: ["authenticated"], withCheck: sql`(auth.uid() = user_id)` }),
	pgPolicy("Users can update own library", { as: "permissive", for: "update", to: ["authenticated"], using: sql`(auth.uid() = user_id)`, withCheck: sql`(auth.uid() = user_id)` }),
	check("library_entries_source_check", sql`source = ANY (ARRAY['manual'::text, 'steam'::text])`),
])

export const lists = pgTable("lists", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	name: text().notNull(),
	description: text(),
	isPublic: boolean("is_public").default(true),
	isDefault: boolean("is_default").default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	isPinned: boolean("is_pinned").default(false),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "lists_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Public lists are readable", { as: "permissive", for: "select", to: ["public"], using: sql`((is_public = true) OR (auth.uid() = user_id))` }),
	pgPolicy("Users can delete own lists", { as: "permissive", for: "delete", to: ["authenticated"], using: sql`((auth.uid() = user_id) AND (is_default = false))` }),
	pgPolicy("Users can insert own lists", { as: "permissive", for: "insert", to: ["authenticated"], withCheck: sql`(auth.uid() = user_id)` }),
	pgPolicy("Users can update own lists", { as: "permissive", for: "update", to: ["authenticated"], using: sql`(auth.uid() = user_id)`, withCheck: sql`(auth.uid() = user_id)` }),
	check("list_description_length", sql`char_length(COALESCE(description, ''::text)) <= 500`),
	check("list_name_length", sql`(char_length(name) >= 1) AND (char_length(name) <= 80)`),
])

export const steamAccounts = pgTable("steam_accounts", {
	userId: uuid("user_id").default(sql`auth.uid()`).primaryKey().notNull(),
	steamId: text("steam_id"),
	linkedAt: date("linked_at").defaultNow().notNull(),
	lastSyncedAt: date("last_synced_at").defaultNow().notNull(),
	profilePublic: boolean("profile_public").default(true).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "steam_accounts_user_id_fkey"
		}).onDelete("cascade"),
	unique("steam_accounts_steam_id_key").on(table.steamId),
	pgPolicy("Steam profiles are readable", { as: "permissive", for: "select", to: ["public"], using: sql`(auth.uid() = user_id)` }),
	pgPolicy("Users can delete own steam profiles", { as: "permissive", for: "delete", to: ["authenticated"], using: sql`(auth.uid() = user_id)` }),
	pgPolicy("Users can insert own steam profiles", { as: "permissive", for: "insert", to: ["authenticated"], withCheck: sql`(auth.uid() = user_id)` }),
	pgPolicy("Users can update own steam profiles", { as: "permissive", for: "update", to: ["authenticated"], using: sql`(auth.uid() = user_id)`, withCheck: sql`(auth.uid() = user_id)` }),
])

export const users = pgTable("users", {
	id: uuid().primaryKey().notNull(),
	username: text().notNull(),
	displayName: text("display_name"),
	avatarUrl: text("avatar_url"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	selectedTitle: text("selected_title"),
	favoriteGameIds: uuid("favorite_game_ids").array().default([]),
	userBio: text("user_bio"),
	defaultListPublic: boolean("default_list_public").default(true),
	libraryPublic: boolean("library_public").default(true),
	loadoutPublic: boolean("loadout_public").default(true),
	loadoutIdentity: text("loadout_identity"),
	loadoutIdentityAt: timestamp("loadout_identity_at", { withTimezone: true, mode: 'string' }),
	profileLoadoutBio: text("profile_loadout_bio"),
}, (table) => [
	foreignKey({
			columns: [table.id],
			foreignColumns: [table.id],
			name: "users_id_fkey"
		}).onDelete("cascade"),
	unique("users_username_key").on(table.username),
	pgPolicy("Public read access", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
	pgPolicy("Users can insert own profile", { as: "permissive", for: "insert", to: ["authenticated"], withCheck: sql`(auth.uid() = id)` }),
	pgPolicy("Users can update own profile", { as: "permissive", for: "update", to: ["authenticated"], using: sql`(auth.uid() = id)`, withCheck: sql`(auth.uid() = id)` }),
	check("favorite_games_max", sql`(favorite_game_ids IS NULL) OR (cardinality(favorite_game_ids) <= 5)`),
	check("user_bio_length", sql`char_length(COALESCE(user_bio, ''::text)) <= 500`),
	check("username_format", sql`username ~ '^[A-Za-z0-9_]{3,20}$'::text`),
])

export const gameGenres = pgTable("game_genres", {
	gameId: uuid("game_id").notNull(),
	genreId: uuid("genre_id").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.gameId],
			foreignColumns: [games.id],
			name: "game_genres_game_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.genreId],
			foreignColumns: [genres.id],
			name: "game_genres_genre_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.gameId, table.genreId], name: "game_genres_pkey"}),
	pgPolicy("Public read access", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
])

export const gamePlatforms = pgTable("game_platforms", {
	gameId: uuid("game_id").notNull(),
	platformId: uuid("platform_id").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.gameId],
			foreignColumns: [games.id],
			name: "game_platforms_game_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.platformId],
			foreignColumns: [platforms.id],
			name: "game_platforms_platform_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.gameId, table.platformId], name: "game_platforms_pkey"}),
	pgPolicy("Public read access", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
])

export const gameDevelopers = pgTable("game_developers", {
	gameId: uuid("game_id").notNull(),
	developerId: uuid("developer_id").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.developerId],
			foreignColumns: [developers.id],
			name: "game_developers_developer_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.gameId],
			foreignColumns: [games.id],
			name: "game_developers_game_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.gameId, table.developerId], name: "game_developers_pkey"}),
	pgPolicy("Public read access", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
])

export const gamePublishers = pgTable("game_publishers", {
	gameId: uuid("game_id").notNull(),
	publisherId: uuid("publisher_id").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.gameId],
			foreignColumns: [games.id],
			name: "game_publishers_game_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.publisherId],
			foreignColumns: [publishers.id],
			name: "game_publishers_publisher_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.gameId, table.publisherId], name: "game_publishers_pkey"}),
	pgPolicy("Public read access", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
])

export const listLikes = pgTable("list_likes", {
	userId: uuid("user_id").notNull(),
	listId: uuid("list_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.listId],
			foreignColumns: [lists.id],
			name: "list_likes_list_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "list_likes_user_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.listId], name: "list_likes_pkey"}),
	pgPolicy("Anyone can see likes", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
	pgPolicy("Users can like lists", { as: "permissive", for: "insert", to: ["authenticated"], withCheck: sql`(auth.uid() = user_id)` }),
	pgPolicy("Users can unlike lists", { as: "permissive", for: "delete", to: ["authenticated"], using: sql`(auth.uid() = user_id)` }),
])

export const follows = pgTable("follows", {
	followerId: uuid("follower_id").notNull(),
	followingId: uuid("following_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.followerId],
			foreignColumns: [users.id],
			name: "follows_follower_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.followingId],
			foreignColumns: [users.id],
			name: "follows_following_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.followerId, table.followingId], name: "follows_pkey"}),
	pgPolicy("Anyone can see follows", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
	pgPolicy("Users can follow others", { as: "permissive", for: "insert", to: ["authenticated"], withCheck: sql`(auth.uid() = follower_id)` }),
	pgPolicy("Users can unfollow", { as: "permissive", for: "delete", to: ["authenticated"], using: sql`(auth.uid() = follower_id)` }),
	check("follows_check", sql`follower_id <> following_id`),
])

export const listGames = pgTable("list_games", {
	listId: uuid("list_id").notNull(),
	gameId: uuid("game_id").notNull(),
	position: integer().default(0).notNull(),
	addedAt: timestamp("added_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.gameId],
			foreignColumns: [games.id],
			name: "list_games_game_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.listId],
			foreignColumns: [lists.id],
			name: "list_games_list_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.listId, table.gameId], name: "list_games_pkey"}),
	pgPolicy("List games readable if list is readable", { as: "permissive", for: "select", to: ["public"], using: sql`(EXISTS ( SELECT 1
   FROM lists
  WHERE ((lists.id = list_games.list_id) AND ((lists.is_public = true) OR (lists.user_id = auth.uid())))))` }),
	pgPolicy("Users can manage games in own lists", { as: "permissive", for: "insert", to: ["authenticated"], withCheck: sql`(EXISTS ( SELECT 1
   FROM lists
  WHERE ((lists.id = list_games.list_id) AND (lists.user_id = auth.uid()))))` }),
	pgPolicy("Users can remove games from own lists", { as: "permissive", for: "delete", to: ["authenticated"], using: sql`(EXISTS ( SELECT 1
   FROM lists
  WHERE ((lists.id = list_games.list_id) AND (lists.user_id = auth.uid()))))` }),
])


// Non-exposed operational schema. Runtime role owns/bypasses RLS; browser roles
// have no schema/table/function grants (see 0003). Never expose through API routes.
const igdbPrivate = pgSchema('igdb_private')
export const igdbRequestBudgets = igdbPrivate.table('request_budgets', {
    credentialKey: text('credential_key').primaryKey(),
    nextStartAt: timestamp('next_start_at', { withTimezone: true, mode: 'string' }).notNull().default(sql`'-infinity'::timestamptz`),
}, table => [check('request_budgets_credential_key_check', sql`${table.credentialKey} ~ '^[0-9a-f]{64}$'`)]).enableRLS()
export const igdbRequestLeases = igdbPrivate.table('request_leases', {
    id: uuid().primaryKey().defaultRandom(),
    credentialKey: text('credential_key').notNull().references(() => igdbRequestBudgets.credentialKey, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
}, table => [index('request_leases_scope_expiry_idx').on(table.credentialKey, table.expiresAt)]).enableRLS()

// Server-managed mappings; no browser access (0004 revokes default grants).
export const gameExternalIds = pgTable('game_external_ids', {
    provider: text().notNull(),
    externalId: text('external_id').notNull(),
    gameId: uuid('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
    matchMethod: text('match_method').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, table => [
    unique('game_external_ids_provider_external_id_key').on(table.provider, table.externalId),
    index('game_external_ids_game_id_idx').on(table.gameId),
    check('game_external_ids_provider_check', sql`${table.provider} <> ''`),
    check('game_external_ids_external_id_check', sql`${table.externalId} <> ''`),
    check('game_external_ids_match_method_check', sql`${table.matchMethod} = 'igdb_external_id'`),
]).enableRLS()
export const steamMatchCache = igdbPrivate.table('steam_match_cache', {
    steamAppId: integer('steam_app_id').notNull(),
    matcherVersion: text('matcher_version').notNull(),
    status: text().notNull(),
    checkedAt: timestamp('checked_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    retryAfter: timestamp('retry_after', { withTimezone: true, mode: 'string' }).notNull(),
}, table => [
    primaryKey({ columns: [table.steamAppId, table.matcherVersion] }),
    check('steam_match_cache_steam_app_id_check', sql`${table.steamAppId} > 0`),
    check('steam_match_cache_matcher_version_check', sql`${table.matcherVersion} <> ''`),
    check('steam_match_cache_status_check', sql`${table.status} IN ('unmatched', 'ambiguous')`),
    check('steam_match_cache_check', sql`${table.retryAfter} >= ${table.checkedAt}`),
]).enableRLS()
export const steamImportRuns = igdbPrivate.table('steam_import_runs', {
    userId: uuid('user_id').primaryKey(),
    ownerToken: uuid('owner_token').notNull(),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true, mode: 'string' }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }).notNull(),
}).enableRLS()
// 0004 created this table. The reset command is gone; the table stays so
// schema.ts still matches the applied migration.
// 0009. Fixed-window /api/v1 counters. Browser roles have no grants.
export const apiRateLimits = pgTable('api_rate_limits', {
    bucket: text().primaryKey(),
    windowStart: timestamp('window_start', { withTimezone: true, mode: 'string' }).notNull(),
    hits: integer().notNull(),
}, table => [
    check('api_rate_limits_bucket_length', sql`char_length(${table.bucket}) between 1 and 200`),
    check('api_rate_limits_hits_nonnegative', sql`${table.hits} >= 0`),
]).enableRLS()
// 0010. Phone Steam OpenID intents. The raw token and completion code are not stored.
export const steamLinkIntents = pgTable('steam_link_intents', {
    id: uuid().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    codeChallenge: text('code_challenge').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    steamId: text('steam_id'),
    completionCodeHash: text('completion_code_hash'),
}, table => [
    index('steam_link_intents_user_id_idx').on(table.userId),
    uniqueIndex('steam_link_intents_one_live_idx').on(table.userId).where(sql`${table.consumedAt} is null`),
    check('steam_link_intents_expires_after_create', sql`${table.expiresAt} > ${table.createdAt}`),
    check('steam_link_intents_challenge_shape', sql`${table.codeChallenge} ~ '^[A-Za-z0-9_-]{43,128}$'`),
    check('steam_link_intents_steam_id_shape', sql`${table.steamId} is null or ${table.steamId} ~ '^[0-9]{17}$'`),
    check('steam_link_intents_code_hash_shape', sql`${table.completionCodeHash} is null or ${table.completionCodeHash} ~ '^[A-Za-z0-9_-]{43}$'`),
]).enableRLS()

export const catalogResetRuns = igdbPrivate.table('catalog_reset_runs', {
    runId: uuid('run_id').primaryKey(),
    manifestChecksum: text('manifest_checksum').notNull(),
    committedAt: timestamp('committed_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, table => [check('catalog_reset_runs_manifest_checksum_check', sql`${table.manifestChecksum} ~ '^[0-9a-f]{64}$'`)]).enableRLS()
