# Loadout Read-out

The Read-out is the signed-in player's generated identity paragraph on their Loadout page. Generating it asks for a new paragraph and, when that paragraph is non-empty, saves it on the account.

## Sub-features

- `readout-menu` opens your Loadout from the account menu after sign-in.
- `readout-direct` opens the same Loadout at `/user/peek/loadout` while you are signed in.
- `readout-generate` clicks `Generate your Read-out` and shows the outcome on the page.
- `readout-persist` shows the saved paragraph and the same text on the account row.

## How to get to it (user POV)

- On the home page, choose `Sign In`, enter the fixture email and password, choose `Sign In` in the dialog, open the `peek` account menu, and choose `Loadout`.
- While signed in, open `/user/peek/loadout`.

## Driving it with verify-screenpeak

Preconditions:

- `node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs doctor` exits 0.
- The home page is `http://127.0.0.1:3210`.
- `peek` has five ratings and `loadout_identity` is null at the start of the drive (the drive resets it).
- No other verification drive is using this database. A second generate within a minute returns `slow down`.

- **Sign in.** Choose `Sign In` in the nav. The dialog named `Sign In` appears. Enter `hornflakes+peek@mail.grokbot.com` and `peekpeek`, then choose the dialog's `Sign In` button. The nav shows `peek`.
- **Menu entry.** Open the `peek` account menu and choose `Loadout`. The heading reads `peek's Loadout`, the page shows `5` rated, the catalogue marker (`Fixture Roguelike`, or the shared IGDB genre), and `Generate your Read-out`.
- **Direct entry.** Open `http://127.0.0.1:3210/user/peek/loadout` again while still signed in. The same heading and `Generate your Read-out` are shown.
- **Generate.** Choose `Generate your Read-out`. The drive runs that click. When `ANTHROPIC_API_KEY` is set, the page replaces the empty copy with the generated paragraph and the button reads `Regenerate`. When the key is missing, the page shows `Couldn't generate right now. Try again shortly.` and this step fails.
- **Confirm persistence.** Read the account row. Run the drive's Postgres read (included in `drive loadout-readout`). `users.loadout_identity` equals the paragraph on the page, and `loadout_identity_at` is set. A null column means the save did not happen.
- **Proof.** The drive writes `/tmp/screenpeak-verify/evidence/loadout-readout/before.png`, `after.png`, `result.json`, and `postgres.txt`. `before.png` shows the fixture Loadout and the Generate control. `after.png` and `postgres.txt` show the same paragraph.

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive loadout-readout
```

## Gotchas

- Fewer than five ratings replaces the Generate control with `Rate N more games to unlock your Read-out`. The fixture must have five ratings or the generate step fails. Do not lower the threshold to make the click appear.
- The route allows one generation per minute. Reset `loadout_identity_at` before a retry. The drive does that itself; a manual second click inside the minute shows `Just generated one. Wait a minute and try again.`
- `lib/loadout.ts` always calls Anthropic. There is no stub provider. A missing `ANTHROPIC_API_KEY` fails the request before the account row is updated. Record the env var. Do not paste a fake paragraph into Postgres or the screenshot.
- Missing `TWITCH_CLIENT_ID` or `TWITCH_CLIENT_SECRET` skips IGDB and uses the fixture games. Do not point `seed:igdb` at a hosted database. A seed that fails while those keys are set is a failure, not a cue to insert the fixture.
- `auth.uid()` from `apps/web/db/local/auth-stubs.sql` returns null. The launcher replaces it so the signed-in save can match the user. If you skip that replacement, the page can still render (Drizzle bypasses RLS) while the save changes zero rows.
- The sign-in labels are not tied to the inputs. Fill the placeholders `Email` and `Password` inside the dialog named `Sign In`.
- `up` creates a cluster-wide `authenticator` role. `test:igdb-integration` cannot apply `auth-stubs.sql` on that cluster until `down` drops the role.
- A signed-out visit to `/user/peek/loadout` still renders the public stats and the text `No Read-out yet.` It does not show `Generate your Read-out`. That is not the generate path.
