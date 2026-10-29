import { relations } from "drizzle-orm/relations"
import { games, ratingsReviews, users, libraryEntries, lists, steamAccounts, usersInAuth, gameGenres, genres, gamePlatforms, platforms, developers, gameDevelopers, gamePublishers, publishers, listLikes, follows, listGames, gameExternalIds } from "./schema"

export const ratingsReviewsRelations = relations(ratingsReviews, ({one}) => ({
	game: one(games, {
		fields: [ratingsReviews.gameId],
		references: [games.id]
	}),
	user: one(users, {
		fields: [ratingsReviews.userId],
		references: [users.id]
	}),
}))

export const gamesRelations = relations(games, ({many}) => ({
	ratingsReviews: many(ratingsReviews),
	libraryEntries: many(libraryEntries),
	gameGenres: many(gameGenres),
	gamePlatforms: many(gamePlatforms),
	gameDevelopers: many(gameDevelopers),
	gamePublishers: many(gamePublishers),
	listGames: many(listGames),
	gameExternalIds: many(gameExternalIds),
}))

export const usersRelations = relations(users, ({one, many}) => ({
	ratingsReviews: many(ratingsReviews),
	libraryEntries: many(libraryEntries),
	lists: many(lists),
	steamAccounts: many(steamAccounts),
	usersInAuth: one(usersInAuth, {
		fields: [users.id],
		references: [usersInAuth.id]
	}),
	listLikes: many(listLikes),
	follows_followerId: many(follows, {
		relationName: "follows_followerId_users_id"
	}),
	follows_followingId: many(follows, {
		relationName: "follows_followingId_users_id"
	}),
}))

export const libraryEntriesRelations = relations(libraryEntries, ({one}) => ({
	game: one(games, {
		fields: [libraryEntries.gameId],
		references: [games.id]
	}),
	user: one(users, {
		fields: [libraryEntries.userId],
		references: [users.id]
	}),
}))

export const listsRelations = relations(lists, ({one, many}) => ({
	user: one(users, {
		fields: [lists.userId],
		references: [users.id]
	}),
	listLikes: many(listLikes),
	listGames: many(listGames),
}))

export const steamAccountsRelations = relations(steamAccounts, ({one}) => ({
	user: one(users, {
		fields: [steamAccounts.userId],
		references: [users.id]
	}),
}))

export const usersInAuthRelations = relations(usersInAuth, ({many}) => ({
	users: many(users),
}))

export const gameGenresRelations = relations(gameGenres, ({one}) => ({
	game: one(games, {
		fields: [gameGenres.gameId],
		references: [games.id]
	}),
	genre: one(genres, {
		fields: [gameGenres.genreId],
		references: [genres.id]
	}),
}))

export const genresRelations = relations(genres, ({many}) => ({
	gameGenres: many(gameGenres),
}))

export const gamePlatformsRelations = relations(gamePlatforms, ({one}) => ({
	game: one(games, {
		fields: [gamePlatforms.gameId],
		references: [games.id]
	}),
	platform: one(platforms, {
		fields: [gamePlatforms.platformId],
		references: [platforms.id]
	}),
}))

export const platformsRelations = relations(platforms, ({many}) => ({
	gamePlatforms: many(gamePlatforms),
}))

export const gameDevelopersRelations = relations(gameDevelopers, ({one}) => ({
	developer: one(developers, {
		fields: [gameDevelopers.developerId],
		references: [developers.id]
	}),
	game: one(games, {
		fields: [gameDevelopers.gameId],
		references: [games.id]
	}),
}))

export const developersRelations = relations(developers, ({many}) => ({
	gameDevelopers: many(gameDevelopers),
}))

export const gamePublishersRelations = relations(gamePublishers, ({one}) => ({
	game: one(games, {
		fields: [gamePublishers.gameId],
		references: [games.id]
	}),
	publisher: one(publishers, {
		fields: [gamePublishers.publisherId],
		references: [publishers.id]
	}),
}))

export const publishersRelations = relations(publishers, ({many}) => ({
	gamePublishers: many(gamePublishers),
}))

export const listLikesRelations = relations(listLikes, ({one}) => ({
	list: one(lists, {
		fields: [listLikes.listId],
		references: [lists.id]
	}),
	user: one(users, {
		fields: [listLikes.userId],
		references: [users.id]
	}),
}))

export const followsRelations = relations(follows, ({one}) => ({
	user_followerId: one(users, {
		fields: [follows.followerId],
		references: [users.id],
		relationName: "follows_followerId_users_id"
	}),
	user_followingId: one(users, {
		fields: [follows.followingId],
		references: [users.id],
		relationName: "follows_followingId_users_id"
	}),
}))

export const listGamesRelations = relations(listGames, ({one}) => ({
	game: one(games, {
		fields: [listGames.gameId],
		references: [games.id]
	}),
	list: one(lists, {
		fields: [listGames.listId],
		references: [lists.id]
	}),
}))
export const gameExternalIdsRelations = relations(gameExternalIds, ({ one }) => ({
    game: one(games, { fields: [gameExternalIds.gameId], references: [games.id] }),
}))
