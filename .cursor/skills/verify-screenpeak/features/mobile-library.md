# Mobile library

The phone library is a two-column cover grid. Each card keeps a half-column width, including the last card when the count is odd. The Library tab is your library. Another player's library is `/user/[username]/library`, opened from their profile counts. It shows when you own it or they made it public. Otherwise the screen says the library is private and does not request the games. A Status dropdown (All, Completed, Playing, Backlog, Abandoned) sits beside the 100% only toggle. A Sort dropdown (Date added, Name, ScreenPeak rating, Your rating) sits beside the ascending/descending toggle. The triggers read Status: All and Sort: Name. Search has a placeholder and no caption. The filters sheet gives each facet its own picker, with a selected count, a search box, and Clear. Changing one of those keeps the current grid, the open filters sheet, and unsubmitted search text on screen. Each card shows the status chip, both scores, hours, times played, and a 100% trophy when that flag is set. Those stats are named for a screen reader. The owner edits from a pencil on the cover's bottom-right. That press opens the library sheet and does not open the game. Tapping the rest of the card opens the game. This drive checks that screen on Expo web. It does not open a device.

## Sub-features

- `own-library` shows peek's games, the Status and Sort dropdowns, the 100% only toggle, the sort direction toggle, the hours icon, and a centered ScreenPeak wordmark. An odd count keeps the last card at half width.
- `filters` opens the filters sheet. A facet picker shows its search box, and Clear filters is on the sheet.
- `empty-search` shows No games found for a search that matches nothing.
- `open-game` opens a game from a card and comes Back.
- `edit` opens Manage game from the cover pencil and stays on the library. Close does not save.
- `private-library` shows This library is private for ada, with Back, and does not request the library.
- `wordmark` keeps Screen | Peak centered on the feed at 375 and 320.

## How to get to it (user POV)

- Log in as peek and open the Library tab.
- Tap Filters, then Close. Search for a name that is not in the library.
- Tap a game, then Back. Tap Edit on that game, then Close.
- Open `http://localhost:8081/user/ada/library`.
- Open the Feed tab. The wordmark stays centered.

## Driving it with verify-screenpeak

Preconditions:

- `node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs doctor` exits 0.
- The website API is `http://127.0.0.1:3210`. The database is local `screenpeak_verify_copy`.
- Port 8081 is free. The drive starts Expo web at `http://localhost:8081` and stops it before it exits. `--host localhost` listens on localhost, which is not `127.0.0.1` on this machine.
- `peek` has five library games, three completed and two playing. The drive inserts `ada` with a private library and deletes ada before it exits. You start signed out. The drive signs in as peek.

- **Open your library.** The drive signs in, sets the viewport to 375×667, and opens the Library tab. A game name is visible, along with Done, Playing, Status: All, Sort: Name, 100% only, an hours icon, and the sort direction toggle. It opens the Status dropdown, then the cover pencil. It scrolls to the last card. That card is about half a column wide: 165.5px at 375, and 138px at 320. The ScreenPeak wordmark is within 12px of the viewport center. It then checks the same screen at 320×568.
- **Open filters.** Click Filters. The sheet says Clear filters and a facet picker opens its search box. Close it. Repeat at 320×568.
- **Search with no match.** Type `zzzz-no-such-game` into the Search games field and click Search. The screen says No games found and the game name is gone. Check that at both widths, then clear the search. The field's placeholder is Search games.
- **Change the sort direction.** Open Sort: Name and click Date added. The toggle is named Sort descending — tap for ascending, and the games stay on screen. Check that at 375×667 and 320×568.
- **Open a game.** Click the game. The path starts with `/games/` and Add to list is on the page. Click Back. The library shows the game again.
- **Open the edit sheet.** Click Edit for that game. The sheet says Manage game and Update library entry, and the path stays on the library. Click Close. Nothing is saved.
- **Open a private library.** Open `/user/ada/library` at both widths. The screen says This library is private. It does not say Not found, it does not show a game, and it does not request `/api/v1/user/ada/library`. The wordmark stays centered with Back in the leading column.
- **Check the wordmark on the feed.** Open the Feed tab at 375×667 and 320×568. ScreenPeak stays within 12px of center.
- **Proof.** The drive writes `/tmp/screenpeak-verify/evidence/mobile-library/`. The png files are the header, the open Status dropdown, the cover edit overlay, the odd-count grid, the sort toggle, filters with a facet search, empty search, and private library at both sizes, plus the feed wordmark at both sizes. `result.json` records the wordmark offsets.

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive mobile-library
```

## Gotchas

- The library API returns the filtered set in one response. The phone does not page it. An empty grid is the search or the filter, not a missing next page.
- A private library and a missing player are the same 404 from `GET /api/v1/user/[username]/library`. The phone reads the profile hub model first. That model is cached under the same key as the profile screen. Do not treat the private screen as Not found.
- Status chips say Done and Dropped. The Status dropdown says Completed and Abandoned. The closed screen shows Status: All and Sort: Name.
- The drive does not change a library row. Close the edit sheet without Update library entry.
- Expo web mounts every tab. Read the active tabpanel. The word Library is also the tab label.
- The drive inserts ada and deletes that auth user before it exits, including after a failure. `down` drops the database. Do not point this drive at a hosted database.
