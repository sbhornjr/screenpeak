# Mobile navigation

The phone app opens on four tabs: Feed, Explore, Library, and Profile. Signed out, Feed is a welcome with Sign up, Log in, and Browse. Explore still searches and browses. Library and Profile ask you to sign up. Profile is a hub: Loadout, Lists, and a library preview. Those sections show only when you are looking at your own profile, or when that player has made the section public. Lists have no profile-wide privacy flag, so the Lists link stays, matching the website. A hidden section is not drawn and the hub does not request its route. This drive checks the phone UI on Expo web against the local API. It does not open a device.

## Sub-features

- `tabs-signed-out` shows welcome on Feed, search and Browse all on Explore, and signup prompts on Library and Profile.
- `tabs-signed-in` shows peek's feed, Explore without the signup prompt, and peek's five library games.
- `own-profile` shows peek's Loadout, Lists, and library counts on the Profile tab after sign-in, and only the signup prompt before it.
- `other-user-public` shows peek's Loadout, Lists, and library counts at `/user/peek` while signed out.
- `other-user-private` shows ada's Lists link and omits Loadout and the library preview, signed out and as peek, without requesting ada's library, loadout, or lists routes.

## How to get to it (user POV)

- Open the Expo web app at `http://localhost:8081/` while signed out. The tabs are Feed, Explore, Library, and Profile.
- Open `http://localhost:8081/user/peek` while signed out.
- Open `http://localhost:8081/user/ada` while signed out. The drive creates ada with library and loadout private, then deletes ada.
- Log in as peek from the Log in screen, then open the same four tabs and `http://localhost:8081/user/ada`.

## Driving it with verify-screenpeak

Preconditions:

- `node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs doctor` exits 0.
- The website API is `http://127.0.0.1:3210`. The database is local `screenpeak_verify_copy`.
- Port 8081 is free. The drive starts Expo web at `http://localhost:8081` and stops it before it exits. `down` also stops a leftover Expo process. `--host localhost` listens on localhost, which is not `127.0.0.1` on this machine.
- `peek` has five ratings and five library games, three of them completed. You start signed out.

- **Open Feed signed out.** The drive opens `http://localhost:8081/`. The screen says Welcome and "Sign up, log in, or browse the catalogue."
- **Browse, then Back.** Click Browse. The catalogue title is Games. Click Back. The welcome is showing again.
- **Open Explore signed out.** Click the Explore tab. The screen has a Search games field, Browse all, and "Sign up to see what people you follow are playing."
- **Open Library signed out.** Click the Library tab. The screen says "Sign up to see your library." None of peek's games are in that panel.
- **Open your profile signed out.** Click the Profile tab. The screen says "Sign up to see your loadout and lists." Loadout, Lists, and the library counts are absent.
- **Open a public profile signed out.** Open `http://localhost:8081/user/peek`. The screen shows peek, Loadout, Lists, and "5 games · 3 completed".
- **Open a private profile signed out.** Open `http://localhost:8081/user/ada`. The screen shows ada and Lists. Loadout and the library counts are absent. The hub does not request `/api/v1/user/ada/library`, `/loadout`, or `/lists`.
- **Log in.** Open `http://localhost:8081/sign-in`, fill Email and Password for peek, and click Log in.
- **Open the tabs signed in.** Feed no longer shows the welcome. Explore no longer asks you to sign up. Library shows one of peek's games. Profile shows peek, Loadout, Lists, and "5 games · 3 completed".
- **Open a game, then the sheets.** On the signed-in Library tab, open the first game. Click the Rate control. The sheet shows Review note, the scores, and Close. Close it. Click Add to list. The sheet shows New list and does not show New list name yet. Click New list, then focus that field. Close the sheet and go Back to the library.
- **Open the library from the hub.** On the Profile tab, click the library preview. The Library tab is selected, the address is `/library`, and the hub is not left on top. Open `http://localhost:8081/user/peek` and click that preview again. The same Library tab is showing.
- **Open the private profile as peek.** Open `http://localhost:8081/user/ada` again. Lists stays. Loadout and the library counts stay absent, and those routes are still not requested.
- **Open the hidden routes.** Open `http://localhost:8081/user/ada/library` and `http://localhost:8081/user/ada/loadout`. Each says Couldn't load this screen and Not found. Neither shows a game title.
- **Proof.** The drive writes `/tmp/screenpeak-verify/evidence/mobile-nav/`. The png files are the tabs, the profile views, the Library tab after each preview tap, the Rate sheet, the Add to list sheet, the focused new-list field, and ada's not-found library and loadout. `result.json` records the profile JSON: peek's signed-out `library_stats.total_games` is 5, ada's `library_stats` is null, ada's library and loadout routes are 404, and peek's own profile JSON has `viewer.is_owner` true. It also records the Library tab path after each preview tap.

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive mobile-nav
```

## Gotchas

- Expo web mounts every tab. Inactive tabs use `display: none`. Read the active tabpanel (`data-state="active"`), not the whole page text. The word Library is also the tab label.
- The hub reads `GET /api/v1/user/[username]` only. Library counts on that payload are null when the library is private. The library and loadout routes themselves are 404 for everyone except the owner. Do not treat a 404 on ada's library as a missing player.
- Lists have no profile-wide flag. A private profile still shows Lists. ada's default Wishlist is public; the hub does not open it.
- peek's library and loadout are public, so signed-out `/user/peek` shows every section. The Profile tab while signed out is the own-profile signup prompt. The Profile tab as peek is the own hub, and its library preview links to the Library tab.
- The drive inserts ada and deletes that auth user before it exits, including after a failure. `down` drops the database. Do not point this drive at a hosted database.
- A missing game name on the signed-in library means the fixture library was not loaded. Doctor checks that peek has five ratings before the drive starts.
