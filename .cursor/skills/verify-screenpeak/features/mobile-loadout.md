# Mobile loadout

A player's Loadout (`/user/[username]/loadout`, opened from the profile's Loadout row) is the website's stats screen. It shows the heading `{username}'s Loadout`, four stats (Saved, Completed, Rated, and Avg truncated to two decimals), the Read-out panel, Scoring style (one bar per score from 10 down to 1, in its tier colour, with the count and share, and the total), Favorite genres and Favorite developers (each with its weighted average in tier colour and its counts), and Top scores and Bottom scores as sideways rails of game cards. Empty sections are left out. The Read-out panel quotes the paragraph to everyone. Its owner also gets Regenerate, Save to profile (which copies the paragraph to the profile and then reads Saved to profile), and Clear my Read-out, which asks first and removes the paragraph and its profile copy. An owner with fewer than five ratings sees how many more they need, a progress bar, and Find games to rate. An eligible owner without a paragraph sees Generate your Read-out. Anyone else without a paragraph sees No Read-out yet. Generating calls `POST /api/v1/me/loadout`; a second generate within a minute names the wait, and an empty model reply says to try again shortly. A private Loadout is Not found for anyone but its owner. This drive checks the screen on Expo web. It does not open a device.

## Sub-features

- `visitor` shows nova's Loadout signed out: No Read-out yet, Rated 2, and no owner controls.
- `owner-readout` shows peek's seeded Read-out in quotes with Drafted with AI and Scoring style.
- `top-scores` opens a game from the Top scores rail and comes Back.
- `save-to-profile` copies the Read-out to `users.profile_loadout_bio`.
- `clear` asks first, then empties `loadout_identity` and `profile_loadout_bio` and offers Generate your Read-out.
- `generate` saves a new paragraph and then shows the one-a-minute limit when `ANTHROPIC_API_KEY` is set. Without the key it shows the try-again message and saves nothing.
- `narrow` shows the owner's Loadout at 320×568.

## How to get to it (user POV)

- Open another player's public Loadout from their profile.
- Log in as peek, open your profile, and tap Loadout.
- Tap a Top scores card, then Back. Tap Save to profile. Tap Clear my Read-out, then Clear it. Tap Generate your Read-out.

## Driving it with verify-screenpeak

Preconditions:

- `node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs doctor` exits 0.
- The website API is `http://127.0.0.1:3210`. The database is local `screenpeak_verify_copy`.
- Port 8081 is free. The drive starts Expo web at `http://localhost:8081` and stops it before it exits.
- `peek` has two library games. The drive inserts `nova` with a public Loadout and two ratings of those games. It saves peek's `loadout_identity`, `loadout_identity_at`, `profile_loadout_bio`, and `loadout_public`, then sets the Read-out to a known paragraph dated two minutes ago and clears the profile copy. Before it exits it deletes nova and puts peek's four columns back. You start signed out.
- `ANTHROPIC_API_KEY` decides what the Generate step proves. The harness has no stub model.

- **Visit nova.** At 375×667, load `/user/nova/loadout`. `nova's Loadout` and No Read-out yet are visible, a stat is named `Rated: 2`, and no Regenerate, Generate your Read-out, Save to profile, Clear my Read-out, or Find games to rate control is on screen. Screenshot `visitor-375.png`.
- **Open your Loadout.** Sign in as peek and load `/user/peek/loadout`. The seeded paragraph shows in quotes, with Drafted with AI · edit anytime and Scoring style, and a stat is named `Rated: <peek's rating count>`. Screenshot `owner-375.png`.
- **Open a top score.** Tap the first link in the Top scores rail. The path starts with `/games/`. Back returns to the Loadout.
- **Save to profile.** Tap Save to profile. It becomes Saved to profile, and `profile_loadout_bio` is the seeded paragraph.
- **Clear.** Tap Clear my Read-out. The sheet says Clear your Read-out?. Screenshot `clear-confirm-375.png`. Tap Clear it. You haven't generated a Read-out yet is visible, and `loadout_identity` and `profile_loadout_bio` are empty. Screenshot `cleared-375.png`.
- **Generate.** Tap Generate your Read-out. With `ANTHROPIC_API_KEY` set, Regenerate appears and `loadout_identity` is saved; tapping Regenerate again shows Too many requests. Without it, `Couldn't write a Read-out right now. Try again shortly.` shows and `loadout_identity` stays empty. Screenshot `generate-375.png`.
- **Check narrow.** At 320×568, screenshot `owner-320.png`.

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive mobile-loadout
```

## Gotchas

- The harness signs in only as peek, so the owner's locked panel (Rate N more games) is covered by the phone unit tests, not by this drive.
- `result.json` records whether `ANTHROPIC_API_KEY` was set. Without it the drive proves the failure path only; say so when reporting.
- Generating within a minute of the last Read-out is refused. The drive dates the seeded paragraph two minutes back for that reason; do not run it twice within a minute with the key set.
- React Native Web does not render a `RefreshControl`, so pull-to-refresh cannot be driven on Expo web.
- Do not run it at the same time as another Expo drive.
