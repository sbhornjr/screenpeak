# Mobile profile

The phone profile shows the player card (avatar, display name, @username, title, member since, follower counts, and bio), then Loadout, Lists, and a library count that opens the library. Favorites, the read-out, recent written reviews, and the stats follow. Loadout and the library counts show only for the owner or when that player made them public. Lists stay linked. Follow shows when you are signed in on someone else's profile. On your own profile a full-width Settings button sits in its place and opens Settings (see [Mobile settings](./mobile-settings.md)), and Edit on the Favorite games heading (Pick favorite games when there are none) opens Choose favorite games: search, tap to pick up to five (a new pick goes first, as on the website), tap a pick to drop it, then Save favorites, which sends `PATCH /api/v1/me` with `favoriteGames` and refetches the profile. View all reviews opens the ratings page (see [Mobile ratings](./mobile-ratings.md)). This drive checks that screen on Expo web. It does not open a device.

## Sub-features

- `own-profile` shows peek's display name, bio, title, read-out, favorite, written review, and library counts, and has no Follow button.
- `stubs` opens Settings from the Settings button and the ratings page from View all reviews.
- `favorites` drops peek's favorite, picks the review game from a search, saves, and checks `users.favorite_game_ids` and the profile.
- `own-library` opens the Library tab from the count, with the hub no longer on top.
- `public-profile` shows nova's name, bio, read-out, library counts, and Follow.
- `follow` follows nova with POST `/api/v1/user/<uuid>/follow`, then unfollows with DELETE on that same path. The follower count moves with the row.
- `private-profile` shows ada's name, bio, Lists, Follow, and written review, and hides Loadout, the read-out, and the library counts.

## How to get to it (user POV)

- Log in as peek and open the Profile tab.
- Tap Settings, then Back. Tap Edit on Favorite games, tap the picked game to drop it, search for another, pick it, and tap Save favorites. Tap View all reviews. That opens `/user/peek/ratings_reviews`, then Back.
- Tap the library counts. The Library tab opens.
- Open `http://localhost:8081/user/nova`. Tap Follow, then Following.
- Tap nova's library counts. That player's library opens, with Back.
- Open `http://localhost:8081/user/ada`.

## Driving it with verify-screenpeak

Preconditions:

- `node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs doctor` exits 0.
- The website API is `http://127.0.0.1:3210`. The database is local `screenpeak_verify_copy`.
- Port 8081 is free. The drive starts Expo web at `http://localhost:8081` and stops it before it exits. `--host localhost` listens on localhost, which is not `127.0.0.1` on this machine.
- `peek` has five ratings and five library games. The drive sets a display name, bio, title, read-out, one favorite, and one written review, then restores them. It inserts `nova` (library and loadout public, two games, one written review) and `ada` (library and loadout private, one written review, no library rows). You start signed out. The drive signs in as peek.

- **Open your profile.** The drive signs in, sets the viewport to 375×667, and opens the Profile tab. The screen shows Peek Reader, @peek, Range Finder, the bio, the read-out, the favorite game, the written review, Loadout, Lists, and the library counts. Follow is not a control. Settings and Edit favorite games are present. It then checks the same screen at 320×568.
- **Open Settings.** Click Settings. Settings opens with Change photo and Danger zone. Click Back.
- **Change favorites.** Click Edit favorite games. Choose favorite games opens with the favorite game picked. Click it to drop it, search `Extremely Long Chronicle`, and pick the review game. The sheet says 1 of 5 picked. Screenshot `favorites-375.png`. Click Save favorites. `favorite_game_ids` is the review game's id alone, the sheet closes, and the profile shows the review game under Favorite games. The drive puts the old favorite back and reloads the profile.
- **Open the ratings page.** Click View all reviews. The path is `/user/peek/ratings_reviews`. The screen says peek's Ratings & Reviews and shows the counts line. Click Back.
- **Open your library.** Click the library counts. The path is `/library`, the Library tab is selected, Back is gone, and Loadout is not on top of the games.
- **Open a public profile.** Open `/user/nova` at 375×667. The screen shows Nova Vale, @nova, the bio, the read-out, Follow, Loadout, Lists, and "2 games · 1 completed". Settings and Edit favorite games are absent. It then checks the same screen at 320×568.
- **Follow and unfollow.** Click Follow. The control becomes Unfollow nova, the page says "1 follower", the request is POST `/api/v1/user/<nova's uuid>/follow`, and Postgres has one follow row. The request is not `/api/v1/user/nova/follow`. Click Following. The control is Follow nova again, the page says "0 followers", the request is DELETE on that uuid path, and the row is gone.
- **Open their library.** Click "2 games · 1 completed". The path is `/user/nova/library`, Back is present, and the game is on the page.
- **Open a private profile.** Open `/user/ada` at 375×667. The screen shows Ada Lovelace, @ada, the bio, Lists, Follow, and the written review. It does not show the read-out, Loadout, or a library count, and it does not request ada's library, loadout, or lists. Settings and Edit favorite games are absent. It then checks the same screen at 320×568.
- **Proof.** The drive writes `/tmp/screenpeak-verify/evidence/mobile-profile/`. The png files are the three profiles at both sizes, plus `review-title-320.png`, the review title scrolled into a 320×568 viewport, and `favorites-375.png`, the favorites sheet with one pick. `result.json` records the follow URL and both library landings. The drive then restores peek's profile columns, the review, and the renamed game, and deletes nova and ada.

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive mobile-profile
```

## Gotchas

- The library count's visible text is "N games · M completed". Click that text. Its accessible name is longer and is not the click target.
- Follow's visible label becomes Following. Click Following to unfollow. The accessible name is Unfollow plus the username.
- The favorites Edit button's visible word is Edit. Its accessible name is Edit favorite games.
- The review game's title is also a link on the profile under the favorites sheet, so the drive clicks inside `[role="dialog"]`. A picked game's accessible name ends in ", picked".
- Lists stay on a private profile. Loadout and the library counts do not. A written review still shows.
- The drive writes peek's profile columns and one review, and restores them, including after a failure. `down` drops the database. Do not point this drive at a hosted database.
- Do not run this drive while another Expo drive is using port 8081.
