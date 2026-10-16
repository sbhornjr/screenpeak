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
- [Game page](./game-page.md) covers the signed-out game JSON at `GET /api/v1/games/[slug]` and the same game on the website. The native screen is not driven here.
