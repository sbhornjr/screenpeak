# Followers/following list

The "X Followers | Y Following" counts on a profile (`/user/[username]`) each open a modal listing the actual players, with a Follow/Unfollow button per row. The phone profile's matching counts line opens an equivalent bottom sheet. Opening either list is blocked entirely — rendered as an empty list, indistinguishable from a real empty one — when the profile owner has blocked the viewer.

## Sub-features

- `followers-modal` — clicking the Followers count opens a modal titled "Followers" listing that player's followers (avatar, username, link to their profile).
- `following-modal` — clicking the Following count opens a modal titled "Following" the same way.
- `follow-row-button` — each row (except the viewer's own) carries a Follow/Unfollow button; toggling it updates that row only.
- `follow-list-self-row` — the viewer's own row, when present in someone else's list, never shows a Follow button.
- `follow-list-signed-out` — signed out, no row shows a Follow button.
- `follow-list-blocked` — a viewer the profile owner has blocked sees an empty list on both counts, the same as a real empty list.
- `follow-list-api` — `GET /api/v1/user/[username]/followers` and `.../following` return `{ users: [...] }` or 404 for a missing player or a blocked viewer.

## How to get to it (user POV)

- Open `http://127.0.0.1:3210/user/<username>` and click either `<N> Followers` or `<N> Following` in the player-card header.
- On the phone (Expo web), open a profile tab and tap either half of the followers/following line under the display name.

## Driving it with verify-screenpeak

Preconditions:

- `node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs doctor` exits 0.
- A second local user who follows (or is followed by) `peek`, so at least one list is non-empty. The fixture setup does not seed any `follows` rows for `peek` today — insert one by hand (`insert into follows (follower_id, following_id) values (...)`) before driving this, and remove it afterward.

**Harness gap — no `drive followers-following-list` command exists yet.** This feature file was written from source (`apps/web/app/components/user/FollowListModal.tsx`, `apps/web/app/user-actions.ts`, `apps/web/app/api/v1/user/[username]/followers|following/route.ts`, `apps/mobile/src/components/follow-list-sheet.tsx`) and has not been live-driven: this environment has no `authenticator`-free local Postgres available to run `up` (a pre-existing, cluster-wide role blocks the auth-stubs step) and no `google-chrome`/`chromium` binary for `drive` regardless. Until a drive script exists, exercise this manually against a working `up` instance:

- **Open the modal.** Sign in as `peek` (or stay signed out), open `/user/<a-followed-or-following-username>`, click `<N> Followers`. A modal titled "Followers" opens with one row per follower: avatar, username, and (signed in, not your own row) a Follow/Unfollow button. Click `<N> Following` and confirm the same for the following list.
- **Toggle a row's follow state.** Click a row's Follow button. It flips to Following (or back) without closing the modal or changing any other row.
- **Confirm the self-row and signed-out cases.** If `peek`'s own id appears in a list you're viewing, that row has no button. Sign out and reopen either list: no row has a button.
- **Confirm the blocked case.** As a viewer `peek` has blocked, open `peek`'s profile and either count. The modal opens to an empty list ("No followers yet." / "Not following anyone yet."), not an error and not a message naming the block.
- **Confirm the API 404s.** `GET /api/v1/user/<blocked-viewer-relevant-username>/followers` as the blocked viewer's bearer token, and the same route for a username that doesn't exist, both return 404 `not_found`.

## Gotchas

- `follow-list-blocked` and a genuinely empty list render identically on purpose (the loader returns `null` for both "not found" and "blocked," and the UI always shows `[]`'s empty copy) — don't treat matching text as a bug; the design explicitly forbids a viewer learning which case it was.
- The fixture harness (`verify-screenpeak up`/`seed:igdb`) does not create any `follows` rows for `peek`, so a fresh stack always starts with both lists empty. Insert at least one `follows` row by hand to see a populated list, and remove it in teardown — it is not part of the fixture this skill restores.
- The web modal fetches through Server Actions (`listFollowers`/`listFollowing` in `app/user-actions.ts`), not the `/api/v1` routes — only the phone app calls those routes. Testing the API directly (curl/fetch) and testing the website modal are two separate checks, not one.
- The Follow button inside the modal is the website's existing `FollowButton` component and triggers a full `router.refresh()` — on a slow connection the row's label can lag briefly behind the click.
