# Mobile settings

Settings (`/settings`, opened from the Settings button on your own profile) is the website's settings page plus the profile's title and bio editors. It shows your avatar with Change photo, your username, title (Title-less Noob when none is picked), and Member since. Profile has Title and Bio. Account has Username, Email, and Password. Privacy has Default list, Library, and Loadout, each Public or Private. Connections shows Steam as Linked or Not linked. Sign out sits below, and Danger zone has Delete account. Each field edits in a sheet: Title picks from the genre titles plus `#1 <name> Fan` for each favorite game and top developer, Bio counts up to 500 characters, Username checks the website's rules before saving, Email sends a confirmation link and keeps the address until it is followed, and Password asks for the current password and the new one twice. Change photo opens the photo library, shrinks the pick to a 512-pixel JPEG, and uploads it to R2. Delete account asks first, deletes through `DELETE /api/v1/me`, and returns to the signed-out home. Signed out, the screen asks you to log in. Favorite games edit on the profile (see [Mobile profile](./mobile-profile.md)). Link Steam makes a PKCE pair, asks `POST /api/v1/me/steam/link-intent` for a state, opens the Steam sign-in in the system browser sheet, and redeems the one-time code from `screenpeak://steamlink` with `link-complete`, then opens `/steamlink`. That screen is the website's import: it runs `POST /api/v1/me/steam/import` a batch at a time, lists the matched games to select and edit (status, hours, times played, 100%), and imports the selection with `POST /api/v1/me/library/import`. Re-sync opens it again. Unlink Steam asks first, then calls `DELETE /api/v1/me/steam`; the library keeps its games. `/steamlink` before Steam is linked says to link in Settings. This drive checks the screen on Expo web. It does not open a device.

## Sub-features

- `signed-out` asks you to log in.
- `open` opens Settings from the profile's Settings button and shows every section, at 375×667 and 320×568.
- `title` saves Soulslike Sicko to `users.selected_title`.
- `bio` saves a new bio to `users.user_bio` and shows it.
- `privacy` flips Library public in `users.library_public`.
- `username` refuses a name with a space, renames peek, then renames peek back.
- `email` shows the confirmation sentence and leaves `auth.users.email` alone.
- `password` refuses a wrong current password, then stores the new one.
- `steam` shows Not linked with Link Steam, `/steamlink` asking you to link in Settings, then Linked with Re-sync for a fixture `steam_accounts` row, and Unlink Steam deleting that row after asking.
- `sign-out` returns to the signed-out home.
- `delete` asks first, Keep my account keeps it, then Delete account removes a throwaway account's `auth.users`, `users`, and rating rows through the gateway's admin delete.

## How to get to it (user POV)

- Log in, open the Profile tab, and tap Settings.
- Tap Change on Title, Username, Email, or Password, or Edit on Bio. Tap a privacy row to flip it.
- Under Connections, tap Link Steam (a real Steam account) or, when linked, Re-sync or Unlink Steam.
- Tap Sign out. Or tap Delete account, then Delete account in the sheet.

## Driving it with verify-screenpeak

Preconditions:

- `node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs doctor` exits 0.
- The website API is `http://127.0.0.1:3210`. The database is local `screenpeak_verify_copy`.
- `apps/web/.env.local` has the local `SUPABASE_SECRET_KEY` that `up` writes, a service-role token signed with the gateway's secret. A stack started before that line existed needs `down` and `up`. The key works only against the gateway.
- Port 8081 is free. The drive starts Expo web at `http://localhost:8081` and stops it before it exits.
- `peek` has a library game. The drive saves peek's username, bio, title, and three privacy flags, and puts them, peek's password, and any Steam row peek had back before it exits. It inserts `dropfan` (`hornflakes+drop@mail.grokbot.com`, password `local-drop-1`) with one rating, and deletes it if the drive did not. You start signed out.

- **Signed out.** At 375×667, load `/settings`. Log in to change your settings. is visible.
- **Open.** Sign in as peek, load `/profile`, and tap Settings. The path is `/settings`, and Profile, Account, Privacy, peek's email, Change photo, Sign out, and Danger zone are visible. Screenshot `settings-375.png`, then `settings-320.png` at 320×568.
- **Title.** Tap Change title and pick Soulslike Sicko. `selected_title` is Soulslike Sicko.
- **Bio.** Tap Edit bio, type the drive's bio, and tap Save bio. `user_bio` matches and the bio shows.
- **Privacy.** Tap Library public. `library_public` flips.
- **Username.** Tap Change username, type `no spaces`, and tap Save username: the rule shows and nothing saves. Type `peek_settings` and save. `username` is `peek_settings` and it shows. Screenshot `renamed-375.png`. Rename back to `peek`.
- **Email.** Tap Change email, type `hornflakes+peeknew@mail.grokbot.com`, and tap Send confirmation link. The Check … for a link sentence shows, and `auth.users.email` is still peek's. Tap Done.
- **Password.** Tap Change password with a wrong current password. Current password is incorrect. shows and `verify_local.passwords` is unchanged. With `peekpeek` as the current password, Password changed. shows and the stored password is the new one. The drive puts `peekpeek` back.
- **Steam.** Settings shows Connections, Not linked, and Link Steam (peek's `steam_accounts` row was removed at the start). Load `/steamlink`: Link Steam in Settings to import your games. shows. Screenshot `steam-unlinked-375.png`. Tap Open Settings. Insert a `steam_accounts` row for peek with a made-up Steam id and reload Settings: Linked, Re-sync, and Unlink Steam show. Screenshot `steam-linked-375.png`. Tap Unlink Steam, then Keep it linked: the row stays. Tap Unlink Steam, then Unlink Steam account: the row is gone and Not linked shows. The drive never taps Link Steam or Re-sync.
- **Sign out.** Tap Sign out. The path is `/` and the signed-out home shows.
- **Delete.** Sign in as dropfan and load `/settings`. Tap Delete account. Delete your account? shows. Screenshot `delete-confirm-375.png`. Tap Keep my account: the account stays. Tap Delete account, then Delete account in the sheet. The path is `/`, the signed-out home shows, dropfan has no `auth.users`, `users`, or `ratings_reviews` rows, and `/tmp/screenpeak-verify/deletions.json` records the delete. Screenshot `deleted-375.png`.

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive mobile-settings
```

## Gotchas

- Change photo is not driven: it needs a real R2 bucket and the system photo picker. The phone unit tests cover the upload order and its failures.
- Link Steam and the import are not driven. Linking needs a Steam account, and Expo web cannot follow the `screenpeak://` return. Re-sync would call the Steam Web API with the drive's made-up Steam id. The phone unit tests cover the PKCE pair (the RFC 7636 example), the return URL, the batch loop, the merge, and the import body.
- The gateway accepts an email change without sending mail, so the drive proves the sentence and that the address did not change, not the confirmation link.
- Delete account runs only against the throwaway account. Never point it at peek.
- React Native Web does not render a `RefreshControl`, so pull-to-refresh cannot be driven on Expo web.
- Do not run it at the same time as another Expo drive.
