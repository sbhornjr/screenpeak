# Mobile explore

The Explore tab searches games by name, with Browse all under the search bar: before a search it opens the whole catalogue, after one it opens the catalogue with that search. Below that it shows what is peaking in the chosen range (This week, This month, This year, All time). Peak right now is a sideways rail of game cards. Signed in, Recommended for you shows games the people you follow completed and rated 7 or higher (with how many completed it, their average, and whether it is already in your backlog or on your Wishlist), lists they liked, and players they follow. Signed out, that section asks you to sign up. Lists peaking now are list cards with a like heart; on your own list the heart is only a count. At the bottom, the Browse by genre and Browse by platform dropdowns open a sheet of options you can narrow by typing; picking one opens the catalogue filtered to it. Browse all is there too. The catalogue (`/games`) is a two-column cover grid with the total count, a Sort dropdown (Name or ScreenPeak rating) with the direction toggle, a name search, and a Filters sheet: Genre, Platform, and ESRB pick from the page's options, and Developer and Publisher search the server as you type. Each active filter is a removable chip named from the server (a developer link shows the developer's name, not its slug), with Clear all. The grid loads 24 games a page and asks for the next page near the end. A filter or sort change keeps the old grid on screen and says Updating results. This drive checks both screens on Expo web. It does not open a device.

## Sub-features

- `explore-sections` shows nova's completed game in Peak right now and Recommended for you, Ada shelf in Lists peaking now and Recommended for you, and ada under Followed by 1 user you follow, at 375×667.
- `list-like` likes Ada shelf. Both of its cards change to Unlike list, 2 likes from one request, and the like is in Postgres. Peek shelf shows its count, not a button.
- `range` picks All time, which requests `range=alltime` and marks All time selected.
- `search` finds Verify Catalogue 01 and its year. Browse all under the search bar then opens the catalogue with the Search chip and one game.
- `browse-all` opens the whole catalogue from under the search bar before any search.
- `browse-genre` opens the Browse by genre dropdown and opens the catalogue from its first genre, with that genre's chip.
- `developer-link` opens `/games?developer=verify-works`, which shows Developer: Verify Works and 30 games.
- `next-page` scrolls to the end and requests `page=2`. Each of the 30 games shows once.
- `sort` picks ScreenPeak rating (descending, the rated game first), then the toggle requests ascending.
- `developer-typeahead` removes the developer chip, then picks Verify Works again from the Filters sheet's server search.
- `narrow` shows Explore and the catalogue at 320×568.

## How to get to it (user POV)

- Log in as peek and open the Explore tab.
- Like a list that is not yours. Pick All time.
- Search a game name and tap Browse all under the search bar. Go Back. Reopen Explore and tap Browse all before searching, then Back. Open Browse by genre, pick a genre, then Back.
- Open the catalogue for a developer. Scroll to the end. Change the sort and its direction.
- Remove the developer chip, open Filters, search the developer, and pick it.

## Driving it with verify-screenpeak

Preconditions:

- `node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs doctor` exits 0.
- The website API is `http://127.0.0.1:3210`. The database is local `screenpeak_verify_copy`.
- Port 8081 is free. The drive starts Expo web at `http://localhost:8081` and stops it before it exits.
- The drive inserts developer Verify Works and 30 games, Verify Catalogue 01 to 30, released 2024-01-01. It inserts private `ada` and `nova` (public library). Peek follows nova, and nova follows ada. Nova completes and rates Verify Catalogue 01 an 8. Ada owns the public list Ada shelf and peek owns Peek shelf; nova likes both. Before it exits it deletes nova, ada, Peek shelf, the 30 games, and the developer, which removes every follow, like, rating, and library row they had. You start signed out. The drive signs in as peek.

- **Open Explore.** At 375×667, tap the Explore tab and wait for `1 follower completed · 8/10 avg`. Peak right now, Verify Catalogue 01, Recommended for you, `1 user you follow liked this`, `Followed by 1 user you follow`, Lists peaking now, Ada shelf, and Peek shelf are visible, and the sign-up sentence is not. Two controls are named `Like list, 1 like` (Ada shelf trending and recommended) and an element is named `1 like` (Peek shelf). Screenshot `explore-375.png`.
- **Like a list.** Tap `Like list, 1 like`. Two controls become `Unlike list, 2 likes`, one POST to `/like` was sent, no `Like list, 1 like` control is left, and Postgres has peek's like on Ada shelf. Screenshot `explore-liked-375.png`.
- **Change the range.** Tap All time. `GET /api/v1/explore?range=alltime` was sent and All time is selected.
- **Search.** Fill Search games with Verify Catalogue 01 and tap Search. A link named `Verify Catalogue 01, 2024` shows. Screenshot `explore-search-375.png`. Tap the control named `Browse all games matching "Verify Catalogue 01"`. The path is `/games`, the chip says `Search: Verify Catalogue 01`, and the count is 1 game. Screenshot `catalogue-search-375.png`. Back returns to `/explore`.
- **Browse all before searching.** Reload `/explore` and tap Browse all under the search bar. The path is `/games` with no Search chip. Back returns to `/explore`.
- **Browse a genre.** Tap Browse by genre. The sheet lists `Browse <genre>` options. Screenshot `browse-genre-375.png`. Tap the first one. The chip says `Genre: <genre>`. Screenshot `catalogue-genre-375.png`. Back returns to `/explore`. At 320×568, screenshot `explore-320.png`.
- **Open a developer.** Load `/games?developer=verify-works`. The chip says `Developer: Verify Works` and the count is 30 games. Screenshot `catalogue-developer-375.png`. Scroll to the end until all 30 names show. `page=2` was requested and each name shows once. Screenshot `catalogue-end-375.png`.
- **Sort.** Tap Sort: Name, then ScreenPeak rating. The first Verify Catalogue card is Verify Catalogue 01. Tap the direction toggle. Requests with `sort=ngplus_rating` and `order=desc`, then `order=asc`, were sent.
- **Pick a developer by typing.** Tap Remove Developer: Verify Works. Open Filters, tap Developer: Any, and type Verify Wo. A `/api/v1/taxonomy/developers/search` request goes out and Verify Works shows. Screenshot `filters-375.png`. Tap Verify Works, then Close. The chip is back and the catalogue requested `developer=verify-works`. At 320×568, screenshot `catalogue-320.png`.

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive mobile-explore
```

## Gotchas

- React Native Web does not render a `RefreshControl`, so pull-to-refresh on either screen cannot be driven on Expo web. Prove it on a device or simulator.
- The next catalogue page loads from the grid's `onEndReached`, which needs real layout. Keep the 375×667 viewport for the scroll step.
- The Peak right now and recommended game rails scroll sideways. Their cards are in the page, so text checks find them without scrolling.
- Ada shelf is both trending and recommended, so it has two cards. Liking one must change both.
- Do not run it at the same time as another Expo drive.
