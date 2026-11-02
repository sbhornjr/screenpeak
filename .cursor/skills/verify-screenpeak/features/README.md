# ScreenPeak verification map

This directory is the maintained source for verifying ScreenPeak's user-facing web behavior. Read the index before driving the app, then use the matching feature file as the recipe.

Steam import is not in this map. Agents have no Steam account, and the import flow cannot be completed without one.

## Baseline preconditions

- Launch with `node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs up` from the repo root.
- The app is `http://127.0.0.1:3210`. The database is local `screenpeak_verify_copy`.
- The fixture user is username `peek`, email `hornflakes+peek@mail.grokbot.com`, password `peekpeek`, with five library rows and five ratings. Those rows are real IGDB games when both Twitch client variables are set, and the `Peak Fixture` rows otherwise.
- Run `node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs doctor` and require the expected URL, database, and fixture counts.
- Never drive an instance that was not started by this verification run.
- Do not connect this run to a hosted database.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer ARIA roles and accessible names. The sign-in fields use placeholders because the labels are not associated.
- Treat every command as literal.
- Run the browser through `node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive <feature>`.
- Do not remove proof artifacts during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes a screenshot with ScreenPeak visible.
- Mutation proof includes a second read of the Postgres row, saved next to the screenshot.
- Record the feature id with every artifact.
- Report an unreachable path with the command that was run and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify-screenpeak` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

## Features

- [Loadout Read-out](./loadout-readout.md) covers signing in, opening your Loadout, generating the Read-out, and the saved paragraph.
- [Game page](./game-page.md) covers the signed-out game JSON at `GET /api/v1/games/[slug]` and the same game on the website. The native screen is [Mobile game](./mobile-game.md).
- [Read endpoints](./read-endpoints.md) covers the signed-out profile, library, lists, loadout, catalogue, and `/me` JSON, including the private 404s.
- [Game writes](./game-writes.md) covers peek's bearer token updating a rating, a library status, and a list, then restoring the fixture.
- [Search](./search.md) covers signed-out game and developer search, the catalogue developer dropdown, and the favorite-game picker.
- [Mobile navigation](./mobile-nav.md) covers the phone tabs on Expo web, signed out and as peek, including a public profile and a private profile.
- [Mobile profile](./mobile-profile.md) covers the phone profile header, the owner's Settings button, follow, favorites and their editor, recent reviews, and the public and private hubs.
- [Mobile forgot password](./mobile-forgot-password.md) covers the phone reset request, the neutral confirmation, the local reset link, and signing in with the new password.
- [Mobile sign-up](./mobile-sign-up.md) covers creating an account on Expo web, confirming it without a phone code verifier, and signing in.
- [Mobile game](./mobile-game.md) covers the phone game page on Expo web: signed-out reading, the in-app screenshot viewer, the signup prompt, rating and review, library stats, and lists.
- [Mobile library](./mobile-library.md) covers the phone library grid, filters, search, the owner's edit sheet, and a private library.
- [Mobile lists](./mobile-lists.md) covers the phone lists index, a list's games, the owner's create, edit, and delete, and a private list.
- [Mobile feed](./mobile-feed.md) covers the phone Feed tab: followed players' activity cards, the next page on scroll, the links each card opens, and the empty feed.
- [Mobile explore](./mobile-explore.md) covers the phone Explore tab and the catalogue: search, the range, trending and recommended games, lists, and players, list likes, genre browse, and the catalogue's filters, chips, sort, and next page.
- [Mobile ratings](./mobile-ratings.md) covers a player's phone Ratings & Reviews page: the counts, Show and Sort, the next page across tied ratings, the review clamp, the links, and the empty states.
- [Mobile loadout](./mobile-loadout.md) covers a player's phone Loadout: the stats, the Read-out panel for a visitor and for its owner (save to profile, clear, generate), the scoring chart, favorites, and the top and bottom score rails.
- [Mobile settings](./mobile-settings.md) covers the phone Settings screen: the title, bio, username, email, and password editors, the privacy flags, the Steam connection (Not linked, Linked, Unlink) and the unlinked `/steamlink`, Sign out, and Delete account (with a throwaway account).
