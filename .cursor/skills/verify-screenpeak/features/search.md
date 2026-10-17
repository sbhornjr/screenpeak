# Search

Signed out, a name query returns matching games and a developer or publisher query returns matching taxonomy rows. The same queries back the website's filter dropdown and the favorite-game picker. An empty query, a page size above the cap, and a taxonomy table other than developers or publishers are rejected. This drive checks those HTTP responses and types into both website search boxes. It does not build a phone screen.

## Sub-features

- `game-search-api` loads `GET /api/v1/games/search` with `avg_rating`, a uuid id, and a display-ready cover when one is stored.
- `game-search-bounds` rejects an empty `q` and `limit=21` with 400.
- `taxonomy-search-api` loads `GET /api/v1/taxonomy/developers/search` and `GET /api/v1/taxonomy/publishers/search`, and rejects `genres`.
- `search-auth` stays readable with no token and with only a cookie, and a bad bearer is 401.
- `developer-dropdown` opens `/games`, expands filters, and shows a developer match.
- `favorite-picker` signs in and shows a game match in Choose Favorite Games.

## How to get to it (user POV)

- Ask for `http://127.0.0.1:3210/api/v1/games/search` and `http://127.0.0.1:3210/api/v1/taxonomy/developers/search` with no `Authorization` header.
- Open `http://127.0.0.1:3210/games`, choose `+ Filters`, and type in `All Developers`.
- Sign in, open `http://127.0.0.1:3210/user/peek`, choose Edit on Favorite Games, and type in `Search games...`. The heading renders as `FAVORITE GAMES`.

## Driving it with verify-screenpeak

Preconditions:

- `node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs doctor` exits 0.
- The app is `http://127.0.0.1:3210`.
- `peek` has five ratings. One of those games has a developer and a publisher. You start signed out.

- **Read a game search.** The drive reads one of `peek`'s rated games, its developer, and its publisher from Postgres. `GET /api/v1/games/search?q=` with that name and no session is 200. `games` includes that name. `id` is a uuid. `avg_rating` is a number. The body has no `avg_ngplus_rating`. `Cache-Control` is `private, no-store`. When the stored cover is an IGDB image, `cover_image_url` contains `/t_cover_big_2x/`.
- **Reject an unbounded search.** `GET /api/v1/games/search?q=` is 400 `invalid_request`. `GET /api/v1/games/search?q=<name>&limit=21` is 400 `invalid_request`.
- **Read a developer search.** `GET /api/v1/taxonomy/developers/search?q=` with the developer name is 200 and `results` includes that name and a uuid `id`. `GET /api/v1/taxonomy/publishers/search?q=` with the publisher name is 200 and `results` includes that name and a uuid `id`. `GET /api/v1/taxonomy/genres/search?q=a` is 400 `invalid_request`.
- **Keep search readable, and fail a bad token.** The same game search with `Cookie: sb-access-token=website-session` and no bearer is 200. `Authorization: Bearer not-a-token` is 401 `invalid_token`.
- **Search developers on the catalogue.** Open `http://127.0.0.1:3210/games`. Click `+ Filters`. Click the `All Developers` field and type the developer name. The dropdown lists that name.
- **Search games in the favorite picker.** From the same browser, click `Sign In`, enter `hornflakes+peek@mail.grokbot.com` and `peekpeek`, and submit the dialog's `Sign In`. Open `http://127.0.0.1:3210/user/peek`. The heading renders as `FAVORITE GAMES`. Click the Edit button in that section. Type the game name into `Search games...`. The dialog lists that name. Do not click `Lock`.
- **Proof.** The drive writes `/tmp/screenpeak-verify/evidence/search/filters.png`, `favorites.png`, and `result.json`. `filters.png` shows the developer name. `favorites.png` shows the game name inside Choose Favorite Games. `result.json` records the status codes.

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive search
```

## Gotchas

- The dropdown and the picker wait 300 ms after the last keystroke. A screenshot taken before that pause shows `Searching...` or an empty list.
- `+ Filters` toggles to `- Filters`. The developer field is not on the page until then.
- Several sections have an Edit button. The drive clicks the button in the Favorite Games heading, not the first Edit on the page. That heading is CSS-uppercase, so the visible text is `FAVORITE GAMES`. The heading element's own text is still `Favorite Games`.
- The favorite picker is only on your own profile. A signed-out `/user/peek` has no Edit control there.
- The picker is rendered inside the uppercase section, so the visible dialog title is `CHOOSE FAVORITE GAMES`. The title element's own text is `Choose Favorite Games`.
- Clicking `Lock` writes `favorite_games`. This drive must not click it.
- A game whose slug is `search` would not be served by `GET /api/v1/games/[slug]`, because the static `games/search` route is a sibling of `[slug]`. `writeCatalogGame` treats `search` as taken and stores `search-<id>` (`RESERVED_GAME_SLUGS`). `GET /api/v1/games/[slug]/reviews` and `PUT /api/v1/games/[slug]/review` sit under `[slug]`, so `reviews` and `review` are not reserved slugs.
- Fixture games have no cover. A null `cover_image_url` is fine. `avg_rating` is a number because `peek` rated the game.
- The website boxes call `app/search-actions.ts`. The drive's `fetch` calls the GET routes. Both use `lib/queries/game.ts`.
- `genres` is a catalogue filter, not a taxonomy search table. The taxonomy route allows `developers` and `publishers`.
- Search allows 120 requests per minute. This drive stays under that. A 429 here means an earlier run already spent the `local` bucket.
- The favorite picker posts a server action. An input's value is not part of the page text, so an empty-looking page can still have held the query. A 500 in the Next log that says `R2_ACCOUNT_ID is not set` means `lib/r2.ts` threw while that action was loading.
