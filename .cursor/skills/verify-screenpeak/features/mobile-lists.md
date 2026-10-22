# Mobile lists

The phone lists index opens from the Profile hub's Lists row. Your own user tab includes private lists. Another player's tab does not, and opening a private list by its URL says Not found. A Show dropdown reads Show: My lists, or Show: {username}'s lists, and the other choice is Liked lists. Each card shows the name, the game count, a lock when the list is private, the calendar day, and the owner. The profile link is the username text; the rest of the card opens the list. A heart shows the like count. On someone else's list it is a button named Like list or Unlike list with the count. On your own list, and when signed out, the same heart is only the count. Your own card also has Pin. The detail shows the title, description, owner, the same heart, and a two-column cover grid in the order the list stores. The website has no ranked layout, per-game notes, or reorder control, so this screen does not add them. The owner creates a list and edits the name, description, public flag, and pin. Delete asks first. The default Wishlist has no Delete. Add games searches by name, then Save games. Remove sits on the cover, asks first, and does not open the game. This drive checks that screen on Expo web. It does not open a device.

## Sub-features

- `own-index` shows Your Lists, Show: My lists, New list, Night runs, the private Secret shelf, and Wishlist. Lists was opened from the Profile hub. The private card's meta stays on one line at 320. The username link is the text.
- `show-menu` opens the Show dropdown. The choices are My lists and Liked lists.
- `own-detail` shows Night runs, its description, the game, Edit, Add games, and Remove. The game cell stays about half a column wide. There is no Like button. The like count still shows.
- `private-detail` shows Secret shelf, the lock, and the like count, with no Like button.
- `remove` opens Remove for that game and stays on the list. Keep leaves the game there.
- `edit` opens the edit sheet with List name, Description, Public, Pinned, and Delete list, and stays on the list.
- `empty` shows This list is empty on the Wishlist, and Edit has no Delete list.
- `create` opens the New list sheet, creates Drive shelf, then deletes it after Delete this list?
- `other-index` shows ada's lists and Ada's picks. It hides Ada hidden and has no New list.
- `other-detail` shows Ada's picks and a like button named Like list, 0 likes, without Edit, Add games, or Remove. Liking it names the button Unlike list, 1 like, on the detail and on the preview.
- `private-url` says Not found for Ada hidden and does not show the title.

## How to get to it (user POV)

- Log in as peek, open Profile, and tap Lists.
- Tap Show: My lists, then Close. At 320, tap Secret shelf, then Back. Tap Night runs. Tap Remove on the game, then Keep. Tap Edit, then Close.
- Go back and tap Wishlist.
- Go back and tap New list.
- Open `http://localhost:8081/user/ada` and tap Lists, then Ada's picks. Tap Like list, 0 likes, then Back.
- Open the private list's URL.

## Driving it with verify-screenpeak

Preconditions:

- `node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs doctor` exits 0.
- The website API is `http://127.0.0.1:3210`. The database is local `screenpeak_verify_copy`.
- Port 8081 is free. The drive starts Expo web at `http://localhost:8081` and stops it before it exits. `--host localhost` listens on localhost, which is not `127.0.0.1` on this machine.
- `peek` has a library game and a default Wishlist. The drive inserts Night runs, Secret shelf, Ada's picks, and Ada hidden, and deletes those lists and `ada` before it exits. You start signed out. The drive signs in as peek.

- **Open your lists.** The drive signs in, sets the viewport to 375×667, opens Profile, and taps Lists. The path is `/user/peek/lists`. Your Lists, Night runs, Secret shelf, Wishlist, Show: My lists, and New list are visible. The private card exposes Private as its lock's label. The ScreenPeak wordmark is within 12px of the viewport center. It then checks the same screen at 320×568. The private meta row is at most 28px tall. A tap on the username text hits that link, and a tap beside it does not. The username link is at most 96px wide.
- **Open your private list.** At 320, tap Secret shelf. Just for peek. is visible. There is no Like or Unlike button. The count reads 0 likes. Screenshot it, then Back.
- **Open Show.** Tap Show: My lists. The sheet says My lists and Liked lists. Close it.
- **Open your list.** Tap Night runs. The path is that list's id. After midnight. and the game are visible, with Edit, Add games, and Remove. There is no Like button, and the count reads 0 likes. The game cell is about half a column wide: 165.5px at 375, and 138px at 320.
- **Remove without leaving.** Tap Remove for the game. The sheet says Remove and the catalogue sentence, and the path stays on the list. Tap Keep. The game is still there.
- **Open edit.** Tap Edit. The sheet says List name, Description, Public, Pinned, and Delete list. The path stays on the list. Check that at 375×667 and 320×568, then Close. The title is still Night runs.
- **Open the empty Wishlist.** Go Back and tap Wishlist. The screen says This list is empty and Add a few games to get it started. Check that at both widths. Edit has no Delete list. Close it.
- **Create and delete.** Tap New list. The sheet says List name and Create list. Check that at both widths. Type Drive shelf and Temporary., then tap Create list. The index shows Drive shelf and Postgres has one row with that name. Open it, tap Edit, tap Delete list, confirm Delete this list? and This cannot be undone., then tap Delete list. The index no longer shows Drive shelf and the row is gone.
- **Open another player's lists.** Open `/user/ada` and tap Lists. The screen says ada's Lists, Ada's picks, and Show: ada's lists. It does not say Ada hidden or New list. Check that at both widths.
- **Open that public list.** Tap Ada's picks. Public picks. and the game are visible. The like button is named Like list, 0 likes. Edit, Add games, and Remove are not. Check that at both widths. At 320, tap Like list, 0 likes. The button becomes Unlike list, 1 like. Back returns to ada's lists, and that preview uses the same Unlike name.
- **Open the private URL.** Open `/user/ada/lists/` plus Ada hidden's id. The screen says Couldn't load this screen and Not found. It does not show Ada hidden.
- **Proof.** The drive writes `/tmp/screenpeak-verify/evidence/mobile-lists/`. The png files are the index, Secret shelf, Night runs, the edit sheet, the empty Wishlist, the New list sheet, ada's index, Ada's picks, the liked detail, and the liked preview. `result.json` records the paths, cell widths, the private meta height, and the username hit. `postgres.txt` records the deleted Drive shelf.

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive mobile-lists
```

## Gotchas

- The website stores position and has no reorder control, ranked layout, or per-game notes. Do not treat a missing drag handle as a failure.
- A private list and a missing list are the same 404 from `GET /api/v1/user/[username]/lists/[listId]`. The phone says Not found. The index simply omits the private card.
- Wishlist is created with the user and `is_default` is true. Delete is hidden. Do not delete that row.
- The drive creates Drive shelf through the sheet and deletes it before it exits. The other inserted lists are deleted by name in `finally`, including after a failure. `down` drops the database. Do not point this drive at a hosted database.
- Expo web can keep the tab bar mounted. Read the stack screen. Your Lists is the page heading. Lists is the profile row.
- Like on someone else's list is a real write. This drive taps it on Ada's picks, then the cleanup deletes that list.
- The owner has no Like button. The count still has an accessible name such as 0 likes. Private is the lock's accessible name, not a word in the page text.
- A listed game on the game page reads In this list. That check lives in `drive mobile-game`.
