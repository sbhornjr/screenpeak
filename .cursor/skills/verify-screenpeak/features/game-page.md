# Game page

A game page shows the title, the community score, and the written reviews. Signed out, the page and `GET /api/v1/games/[slug]` both load, and the JSON `viewer` is null. The phone uses that same JSON. This drive checks the website and the JSON. The native screen is mobile-game.

## Sub-features

- `game-api` loads `GET /api/v1/games/[slug]` with no session and returns the game, `stats.avg_rating`, and `viewer: null`.
- `game-reviews-api` loads `GET /api/v1/games/[slug]/reviews` with no session and returns a page of reviews.
- `game-web` opens `/games/[slug]` and shows the game's name.

## How to get to it (user POV)

- Open `http://127.0.0.1:3210/games/<slug>` while signed out. `<slug>` is one game `peek` has rated.
- Ask for `http://127.0.0.1:3210/api/v1/games/<slug>` with no `Authorization` header.
- Ask for `http://127.0.0.1:3210/api/v1/games/<slug>/reviews` with no `Authorization` header.

## Driving it with verify-screenpeak

Preconditions:

- `node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs doctor` exits 0.
- The app is `http://127.0.0.1:3210`.
- `peek` has five ratings. The drive uses the first of those games by slug. You do not sign in.

- **Read the API.** The drive fetches `GET /api/v1/games/<slug>` with no session. The status is 200. `game.name` and `game.slug` match the row in Postgres. `viewer` is null. `stats.avg_rating` is a number. The body has no `steam_appid`, no `metacritic`, and no `avg_ngplus_rating`. When the stored cover is an IGDB URL, `game.cover_image_url` uses `t_cover_big_2x` on `images.igdb.com`. When the stored cover is null, `game.cover_image_url` is null.
- **Read the reviews.** The drive fetches `GET /api/v1/games/<slug>/reviews` with no session. The status is 200 and `reviews` is an array.
- **Open the page.** Open `http://127.0.0.1:3210/games/<slug>`. The page shows the game's name, "In your library", and "Sign in to add this game to your library."
- **Sign in and read the library stats.** Click Sign In, sign in as peek, and open the same game again. The page shows hours played, times played, and the 100% flag from peek's library row.
- **Proof.** The drive writes `/tmp/screenpeak-verify/evidence/game-page/page.png`, `library.png`, and `result.json`. `page.png` shows the game name on the website while signed out. `library.png` shows the library section after sign-in. `result.json` records the slug, the API status, `viewer`, and `avg_rating`.

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive game-page
```

## Gotchas

- The fixture games (`peak-fixture-1` and the rest) have no cover. A null `cover_image_url` is the correct payload for them. Do not treat a missing cover as a failed drive.
- An IGDB-seeded cover must come back as `t_cover_big_2x`. A stored `t_thumb` or `t_cover_big` that is still in the JSON means the loader did not rewrite the rendition.
- `peek`'s own rating is included in `stats.avg_rating`. The reviews route leaves that review out only when the request is signed in as `peek`. This drive is signed out, so a written review from `peek` can appear. The fixture writes an empty review string, so the page may show no review text.
- The native game screen is not a step in this drive. Expo web is the layout check for `apps/mobile/src/app/games/[slug].tsx`.
