# Mobile feed

The Feed tab, signed in, lists the activity of the players you follow, newest first, the same rows as the website's home feed. Each card starts with the player's avatar, their username as a link to their profile, what they did, an activity icon, and how long ago it was. A rating or a library add shows the game's cover with one score tag (the community score, else yours), the title, and the year and developer. A review shows the cover with the score, the title, and the review clamped to three lines, with Read more when it is long. A created or liked list shows the name, the description, the like count, the game count, and up to five covers. A batch of library adds shows up to five covers and opens that player's library. The list loads 12 rows at a time and asks for the next page when you scroll near the end. Pull-to-refresh reloads every loaded page. When you follow nobody with activity, the tab says Your feed is quiet and offers Find people to follow, which opens Explore. Signed out, the tab is the welcome screen (see [Mobile navigation](./mobile-nav.md)). This drive checks the tab on Expo web. It does not open a device.

## Sub-features

- `first-page` shows nova's activity, with time-ago labels, at 375×667.
- `next-page` scrolls to the end and requests `GET /api/v1/feed?offset=12`. Every one of nova's 14 tied lists shows exactly once across the two pages.
- `kinds` shows a review, a rating, a batch of three library adds, and the created lists.
- `review-toggle` expands the long review with Read more, and Show less collapses it.
- `game-link` opens the reviewed game.
- `profile-link` opens nova's profile from the username.
- `library-link` opens nova's library from the batch card.
- `narrow` shows the feed at 320×568.
- `empty` shows Your feed is quiet after peek unfollows nova, and Find people to follow opens `/explore`.

## How to get to it (user POV)

- Log in as peek and open the Feed tab.
- Scroll to the end of the feed.
- Tap Read more on nova's review.
- Tap the reviewed game, then Back. Tap nova, then Back. Tap the batch card's covers, then Back.
- Unfollow everyone with activity and open the Feed tab.

## Driving it with verify-screenpeak

Preconditions:

- `node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs doctor` exits 0.
- The website API is `http://127.0.0.1:3210`. The database is local `screenpeak_verify_copy` with migration `0011_feed_total_order` applied (`up` applies every pending migration).
- Port 8081 is free. The drive starts Expo web at `http://localhost:8081` and stops it before it exits.
- `peek` has two library games. The drive inserts `nova` (public library), makes peek follow nova, and writes nova's review of the first game, rating of the second, three library adds, and 14 public lists in one `psql` call, so every feed row shares one `created_at`. It deletes `nova` before it exits, which removes the follow and every row nova wrote. You start signed out. The drive signs in as peek.

- **Check the tie.** Before opening the app, the drive reads `get_feed` for peek and requires exactly one distinct `created_at`. A different count means the fixture did not land in one transaction, and the paging check below would not prove the tie-breakers.
- **Open the feed.** The drive signs in, sets 375×667, and taps the Feed tab. `created the list "Nova shelf 01"` is visible, the empty state is not, and the cards show time-ago labels. Screenshot `feed-375.png`.
- **Load the next page.** The drive scrolls the list to the end until every `created the list "Nova shelf NN"` line from 01 to 14 is on the page. A `GET /api/v1/feed?offset=12` request was sent. Each line appears exactly once. `reviewed <game>`, `rated <game> a 7/10`, and `added 3 games to their library` are visible. Screenshot `feed-end-375.png`.
- **Expand the review.** Tap Read more. Show less is visible. Screenshot `review-expanded-375.png`.
- **Open the game.** Tap the reviewed game's name (its link is named after the game). The path is `/games/<slug>`. Back returns to `/`.
- **Open the player.** Tap the `nova` username link. The path is `/user/nova`. Back returns to `/`.
- **Open the library.** Tap the link named `nova's library`. The path is `/user/nova/library`. Back returns to `/`.
- **Check narrow.** At 320×568, screenshot `feed-320.png`.
- **Empty the feed.** The drive deletes peek's follow of nova and reloads `/`. Your feed is quiet is visible. Screenshot `empty-320.png`. Tap Find people to follow. The path is `/explore`.

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive mobile-feed
```

## Gotchas

- React Native Web does not render a `RefreshControl`, so pull-to-refresh cannot be driven on Expo web. Prove it on a device or simulator.
- The next page loads from the list's `onEndReached`, which needs real layout. A viewport tall enough to show every card never reaches the end. Keep the 375×667 viewport for the scroll step.
- The username link is nested text (`role="link"`, no `aria-label`), so the drive clicks it by its text, not by label.
- Do not run it at the same time as another Expo drive.
