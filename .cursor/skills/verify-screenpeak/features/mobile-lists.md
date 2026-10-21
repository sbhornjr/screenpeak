# Mobile lists

The phone lists index opens from the Profile hub's Lists row. Your own user tab includes private lists. Another player's tab does not, and opening a private list by its URL says Not found. A Show dropdown reads Show: My lists, or Show: {username}'s lists, and the other choice is Liked lists. Each card shows the name, the game count, Private when the list is private, the updated date, the owner, and Like or Pin with the word beside the icon. The detail shows the title, description, owner, and a two-column cover grid in the order the list stores. The website has no ranked layout, per-game notes, or reorder control, so this screen does not add them. The owner creates a list and edits the name, description, public flag, and pin. Delete asks first. The default Wishlist has no Delete. Add games searches by name, then Save games. Remove sits on the cover, asks first, and does not open the game. This drive checks that screen on Expo web. It does not open a device.

## Sub-features

- `own-index` shows Your Lists, Show: My lists, New list, Night runs, the private Secret shelf, and Wishlist. Lists was opened from the Profile hub.
- `show-menu` opens the Show dropdown. The choices are My lists and Liked lists.
- `own-detail` shows Night runs, its description, the game, Edit, Add games, and Remove. The game cell stays about half a column wide.
- `remove` opens Remove for that game and stays on the list. Keep leaves the game there.
- `edit` opens the edit sheet with List name, Description, Public, Pinned, and Delete list, and stays on the list.
- `empty` shows This list is empty on the Wishlist, and Edit has no Delete list.
- `create` opens the New list sheet, creates Drive shelf, then deletes it after Delete this list?
- `other-index` shows ada's lists and Ada's picks. It hides Ada hidden and has no New list.
- `other-detail` shows Ada's picks and Like, without Edit, Add games, or Remove.
- `private-url` says Not found for Ada hidden and does not show the title.

## How to get to it (user POV)

- Log in as peek, open Profile, and tap Lists.
- Tap Show: My lists, then Close. Tap Night runs. Tap Remove on the game, then Keep. Tap Edit, then Close.
- Go back and tap Wishlist.
- Go back and tap New list.
- Open `http://localhost:8081/user/ada` and tap Lists, then Ada's picks.
- Open the private list's URL.

## Driving it with verify-screenpeak

Preconditions:

- `node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs doctor` exits 0.
- The website API is `http://127.0.0.1:3210`. The database is local `screenpeak_verify_copy`.
- Port 8081 is free. The drive starts Expo web at `http://localhost:8081` and stops it before it exits. `--host localhost` listens on localhost, which is not `127.0.0.1` on this machine.
- `peek` has a library game and a default Wishlist. The drive inserts Night runs, Secret shelf, Ada's picks, and Ada hidden, and deletes those lists and `ada` before it exits. You start signed out. The drive signs in as peek.

- **Open your lists.** The drive signs in, sets the viewport to 375×667, opens Profile, and taps Lists. The path is `/user/peek/lists`. Your Lists, Night runs, Secret shelf, Private, Wishlist, Show: My lists, and New list are visible. The ScreenPeak wordmark is within 12px of the viewport center. It then checks the same screen at 320×568.
- **Open Show.** Tap Show: My lists. The sheet says My lists and Liked lists. Close it.
- **Open your list.** Tap Night runs. The path is that list's id. After midnight. and the game are visible, with Edit, Add games, and Remove. The game cell is about half a column wide: 165.5px at 375, and 138px at 320.
- **Remove without leaving.** Tap Remove for the game. The sheet says Remove and the catalogue sentence, and the path stays on the list. Tap Keep. The game is still there.
- **Open edit.** Tap Edit. The sheet says List name, Description, Public, Pinned, and Delete list. The path stays on the list. Check that at 375×667 and 320×568, then Close. The title is still Night runs.
- **Open the empty Wishlist.** Go Back and tap Wishlist. The screen says This list is empty and Add a few games to get it started. Check that at both widths. Edit has no Delete list. Close it.
- **Create and delete.** Tap New list. The sheet says List name and Create list. Check that at both widths. Type Drive shelf and Temporary., then tap Create list. The index shows Drive shelf and Postgres has one row with that name. Open it, tap Edit, tap Delete list, confirm Delete this list? and This cannot be undone., then tap Delete list. The index no longer shows Drive shelf and the row is gone.
- **Open another player's lists.** Open `/user/ada` and tap Lists. The screen says ada's Lists, Ada's picks, and Show: ada's lists. It does not say Ada hidden or New list. Check that at both widths.
- **Open that public list.** Tap Ada's picks. Public picks. and the game are visible. Like is there. Edit, Add games, and Remove are not. Check that at both widths.
- **Open the private URL.** Open `/user/ada/lists/` plus Ada hidden's id. The screen says Couldn't load this screen and Not found. It does not show Ada hidden.
- **Proof.** The drive writes `/tmp/screenpeak-verify/evidence/mobile-lists/`. The png files are the index, Night runs, the edit sheet, the empty Wishlist, the New list sheet, ada's index, and Ada's picks at both sizes. `result.json` records the paths and cell widths. `postgres.txt` records the deleted Drive shelf.

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive mobile-lists
```

## Gotchas

- The website stores position and has no reorder control, ranked layout, or per-game notes. Do not treat a missing drag handle as a failure.
- A private list and a missing list are the same 404 from `GET /api/v1/user/[username]/lists/[listId]`. The phone says Not found. The index simply omits the private card.
- Wishlist is created with the user and `is_default` is true. Delete is hidden. Do not delete that row.
- The drive creates Drive shelf through the sheet and deletes it before it exits. The other inserted lists are deleted by name in `finally`, including after a failure. `down` drops the database. Do not point this drive at a hosted database.
- Expo web can keep the tab bar mounted. Read the stack screen. Your Lists is the page heading. Lists is the profile row.
- Like on someone else's list is a real write. This drive does not tap it.
