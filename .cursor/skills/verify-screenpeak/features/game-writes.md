# Game writes

A signed-in player can score a game, change its library status, and put it on a list. The phone calls `PUT /api/v1/games/[gameId]/review`, `PUT /api/v1/me/library/[gameId]`, and `POST /api/v1/lists`. The same functions back the website's server actions. This drive uses peek's bearer token from the local auth gateway and reads Postgres. It does not open the native screen.

## Sub-features

- `review-put` updates peek's existing rating text and leaves the rating count at 5.
- `library-put` changes that game's library status and leaves the library count at 5. Hours, play count, and the 100% flag set just before the status-only body stay as they were.
- `list-create` creates a private list that already contains the game, then the drive deletes that list with `DELETE /api/v1/lists/[listId]`.
- `write-auth` rejects the review route with 401 `unauthenticated` when no Bearer token is sent, and again when the request carries only a Cookie header.
- `self-follow` rejects `POST /api/v1/user/[userId]/follow` when the id is peek's own.

## How to get to it (user POV)

- On the phone, open a game while signed in and use Rate, Save, or Add to list. Those controls call the write routes.
- `PUT http://127.0.0.1:3210/api/v1/games/<gameId>/review` with `Authorization: Bearer <access_token>`.
- `PUT http://127.0.0.1:3210/api/v1/me/library/<gameId>` with the same header.
- `POST http://127.0.0.1:3210/api/v1/lists` with the same header.
- The same review URL with no Authorization header.

## Driving it with verify-screenpeak

Preconditions:

- `node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs doctor` exits 0.
- The app is `http://127.0.0.1:3210`. The gateway is `http://127.0.0.1:54321`.
- `peek` has five ratings and five library rows. The drive uses the first of those games by slug. The website sign-in dialog is not used. The token comes from `POST /auth/v1/token?grant_type=password` as `hornflakes+peek@mail.grokbot.com` / `peekpeek`.

- **Reject a missing token.** `PUT /api/v1/games/<gameId>/review` with no Authorization header returns 401 and `error.code` `unauthenticated`.
- **Update the review.** The same request with the bearer token and peek's current rating plus review text `verify-screenpeak write` returns 200. `ratings_reviews.review` for that game is that text. The rating count stays 5.
- **Reject a cookie with no bearer.** The same review URL with `Cookie: sb-access-token=website-session` and no Authorization header returns 401 and `error.code` `unauthenticated`.
- **Update the library status.** The drive sets that row to 12.5 hours, play count 4, and the 100% flag, then `PUT /api/v1/me/library/<gameId>` with only `{ "status": "backlog" }` when the row was `playing`, otherwise `{ "status": "playing" }`. The response is 200. `library_entries.status` matches the new status. Hours stay 12.5, play count stays 4, and the 100% flag stays set. The library count stays 5.
- **Create a list with the game.** `POST /api/v1/lists` with name `Verify Write Shelf`, `isPublic: false`, and `gameId` returns 201. `list_games` has one row for that list and game.
- **Reject a self-follow.** `POST /api/v1/user/<peek's id>/follow` with the bearer token returns 400 and `You cannot follow yourself.`
- **Restore.** The drive writes the original rating, review, library status, hours, play count, and 100% flag back, and `DELETE /api/v1/lists/<listId>` removes `Verify Write Shelf`. Counts are 5 and 5 again.
- **Open the page.** Open `http://127.0.0.1:3210/games/<slug>` signed out. The page shows the game's name.
- **Proof.** The drive writes `/tmp/screenpeak-verify/evidence/game-writes/page.png`, `result.json`, and `postgres.txt`. `page.png` shows the game name. `result.json` records the write statuses and the Postgres values from before the restore. `postgres.txt` records the during-write review and status, then the restored row.

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive game-writes
```

## Gotchas

- The path segment on the review route is the game uuid. The folder is still `[slug]` because the GET route owns that name. A slug such as `hades` is 400.
- Restoring is part of the drive. A failed run must still put peek's review text, library status, hours, play count, and 100% flag back, or the next doctor sees a changed fixture even when the counts stay at 5.
- The drive removes `Verify Write Shelf` with `DELETE /api/v1/lists/[listId]`. `list_games` cascades. SQL cleanup runs only when that DELETE did not return 204.
- The native Rate / Save / Add to list controls are not a step in this drive. The phone is not launched here.
- `POST /me/steam/link-intent` is not this drive. Steam linking stays a later step, and this environment has no Steam account.
- A website cookie does not authorize these routes. The drive sends a Cookie-only request and expects 401, then sends the bearer token on the writes.
