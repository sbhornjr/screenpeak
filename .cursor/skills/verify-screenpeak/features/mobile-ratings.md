# Mobile ratings

A player's Ratings & Reviews page (`/user/[username]/ratings_reviews`, opened from View all reviews on the profile) shows a link back to the profile, the heading `{username}'s Ratings & Reviews`, and the counts line (`N ratings / N reviews / N total`). A Show dropdown picks All, Reviews (ratings with a note), or Ratings (score only). A Sort dropdown picks Date or Rating, each starting newest or highest first, with the direction toggle. A score-only rating is one line: a small cover, the name, the year and developer, the score in its tier colour out of 10, and the date. A written review adds a larger cover and the note, clamped to four lines with Read more when it is long. A row opens the game. The list loads 20 rows a page and asks for the next page near the end. Show and Sort stay on screen when nothing matches, so an empty filter can be switched back, and each Show choice has its own empty line. The page is public, signed in or out. Migration 0012 ends both sorts with the date, the game name, and the game id, so pages do not repeat or skip tied rows. This drive checks the page on Expo web. It does not open a device.

## Sub-features

- `heading` shows peek's heading and the counts line from Postgres, signed out, at 375×667.
- `next-page` sorts by Rating, scrolls to the end, and requests `page=2`. Each of the 25 tied Verify Rated rows shows once.
- `reviews` picks Show: Reviews, which requests `filter=reviews` and hides the score-only rows. Read more expands the long review.
- `ratings` picks Show: Ratings, which requests `filter=ratings` and hides the reviewed rows.
- `links` opens a row's game, then peek's profile from the link above the heading.
- `narrow` shows the page at 320×568.
- `empty` shows No ratings yet for ada. Show: Reviews says No written reviews yet, and Show: All switches back.

## How to get to it (user POV)

- Open a profile and tap View all reviews, or open `/user/<username>/ratings_reviews`.
- Pick Sort: Rating and scroll to the end.
- Pick Show: Reviews, tap Read more, then pick Show: Ratings.
- Tap a row, then Back. Tap the profile link.
- Open the page for a player who has rated nothing, and switch Show.

## Driving it with verify-screenpeak

Preconditions:

- `node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs doctor` exits 0.
- The website API is `http://127.0.0.1:3210`. The database is local `screenpeak_verify_copy` with migration `0012_user_reviews_total_order` applied (`up` applies every pending migration).
- Port 8081 is free. The drive starts Expo web at `http://localhost:8081` and stops it before it exits.
- The drive inserts 25 games, Verify Rated 01 to 25, and gives each a peek rating of 8 written at one instant. Verify Rated 01 has a long note and 02 and 03 a short one; the rest are score-only. With peek's own five ratings that is more than one page. It inserts private `ada`, who has rated nothing. Before it exits it deletes the 25 games, which removes their ratings, and ada. You stay signed out.

- **Open the page.** At 375×667, load `/user/peek/ratings_reviews`. `peek's Ratings & Reviews` is visible, and the counts line matches `get_user_ratings_reviews_counts` for peek. Screenshot `ratings-375.png`.
- **Load the next page.** Tap Sort: Date, then Rating. A request with `sort=rating&order=desc` was sent. Scroll to the end until all 25 Verify Rated names show. `page=2` was requested and each name shows once. Screenshot `ratings-end-375.png`.
- **Show reviews.** Tap Show: All, then Reviews. `filter=reviews` was requested, the score-only rows are gone, and Verify Rated 01 to 03 show. Tap Read more. Show less is visible. Screenshot `reviews-expanded-375.png`.
- **Show ratings.** Tap Show: Reviews, then Ratings. `filter=ratings` was requested and Verify Rated 01 is gone. Screenshot `score-only-375.png`.
- **Open a game and the profile.** Tap `Verify Rated 04, 8 out of 10`. The path is `/games/verify-rated-04`. Back returns to the page. Tap `peek's profile`. The path is `/user/peek`.
- **Check narrow.** At 320×568, reload the page and screenshot `ratings-320.png`.
- **Empty.** Load `/user/ada/ratings_reviews`. No ratings yet is visible. Screenshot `empty-320.png`. Pick Show: Reviews: No written reviews yet. Pick Show: All: No ratings yet again.

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive mobile-ratings
```

## Gotchas

- React Native Web does not render a `RefreshControl`, so pull-to-refresh cannot be driven on Expo web. Prove it on a device or simulator.
- The next page loads from the list's `onEndReached`, which needs real layout. Keep the 375×667 viewport for the scroll step.
- Read more shows only for a note longer than 220 characters (React Native cannot measure lines before layout), so the fixture's long note is longer than that.
- Do not run it at the same time as another Expo drive.
