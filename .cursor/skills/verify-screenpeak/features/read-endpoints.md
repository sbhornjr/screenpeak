# Read endpoints

Signed out, the public profile, library, lists, loadout, catalogue, and home-adjacent reads return JSON. A private library, loadout, or list is the same 404 as a missing one. `/api/v1/me` returns no user. Settings asks for a sign-in. This drive checks those HTTP responses and opens `/user/peek`. It does not build a phone screen.

## Sub-features

- `profile-api` loads `GET /api/v1/user/peek` with follower and following counts and `viewer: null`.
- `library-api` loads the public library, then a 404 once `library_public` is false, without a game name in the error.
- `loadout-api` loads the public loadout, then a 404 once `loadout_public` is false.
- `lists-api` keeps a private list off the index and answers its detail URL with 404.
- `catalogue-api` loads `GET /api/v1/games` with `avg_rating` and without `avg_ngplus_rating`.
- `me-api` loads `GET /api/v1/me` as `{ user: null }` and `GET /api/v1/me/settings` as 401.
- `profile-web` opens `/user/peek` and shows the username.

## How to get to it (user POV)

- Open `http://127.0.0.1:3210/user/peek` while signed out.
- Ask for `http://127.0.0.1:3210/api/v1/user/peek`, `/library`, `/lists`, `/loadout`, `/api/v1/games`, `/api/v1/me`, and `/api/v1/me/settings` with no `Authorization` header.

## Driving it with verify-screenpeak

Preconditions:

- `node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs doctor` exits 0.
- The app is `http://127.0.0.1:3210`.
- `peek` has five library rows and five ratings. Library and loadout start public. You do not sign in.

- **Read the profile.** The drive fetches `GET /api/v1/user/peek` with no session. The status is 200. `profile.follower_count` and `profile.following_count` are numbers. `viewer` is null. `library_stats` is present. The body has no `follower_id` and no email.
- **Read the library, then hide it.** The drive fetches `GET /api/v1/user/peek/library`. The status is 200 and `games` is a non-empty array. The body has no `avg_ngplus_rating` and no `steam_appid`. The drive sets `library_public` to false and fetches the same URL. The status is 404 and the message is `Not found.`. The body does not include the public game name. The drive sets `library_public` back to true.
- **Read the loadout, then hide it.** The drive fetches `GET /api/v1/user/peek/loadout`. The status is 200, `rating_count` is a number, and `viewer` is null. The drive sets `loadout_public` to false and fetches the same URL. The status is 404 and the message is `Not found.`. The drive sets `loadout_public` back to true.
- **Hide one list.** The drive inserts a list named `Verify Private Shelf` with `is_public` false. `GET /api/v1/user/peek/lists` is 200 and does not include that name. `GET /api/v1/user/peek/lists/<id>` is 404 `Not found.`. The drive deletes the list.
- **Read the catalogue and the caller card.** `GET /api/v1/games` is 200. The body has no `avg_ngplus_rating`. Each card has `avg_rating`. `GET /api/v1/me` is 200 and `user` is null. `GET /api/v1/me/settings` is 401 `unauthenticated`.
- **Open the profile.** Open `http://127.0.0.1:3210/user/peek`. The page shows `peek`.
- **Proof.** The drive writes `/tmp/screenpeak-verify/evidence/read-endpoints/page.png` and `result.json`. `page.png` shows `peek`. `result.json` records the status codes, including the private 404s.

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive read-endpoints
```

## Gotchas

- The drive changes `library_public` and `loadout_public`, and it inserts `Verify Private Shelf`. Both flags are set back to true and the list is deleted before the drive exits, including when a check fails. A crashed process can leave them dirty: set the flags true and delete that list name before the next drive.
- `peek`'s library is public in the fixture. A 404 on the first library fetch means the flag was left false.
- Fixture games have no cover. A null `cover_image_url` on a catalogue card is fine. `avg_rating` may be null for a game nobody has rated.
- This drive does not sign in, so it cannot prove the owner still sees a private library. That case is in `apps/web/test/lib/loaders/read-pages.test.ts`.
