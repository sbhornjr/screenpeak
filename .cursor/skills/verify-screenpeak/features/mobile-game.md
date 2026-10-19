# Mobile game

The phone game page shows the title, cover, your save, the scoreboard, credits, about, gallery, the community distribution, and written reviews. Signed out, the page is readable and Rate, Save game, or Add to list opens "Sign up to rate, log, or list this game." Signed in, Rate saves a score and an optional note, edits that note, and can delete the note while the score stays. Save game changes library status and sends hours, times played, or the 100% flag only when those fields changed. Add to list puts the game on an existing list or a new one. This drive checks that screen on Expo web at an iPhone SE size. It does not open a device.

## Sub-features

- `signed-out` shows the game name and keeps the signup prompt closed until an action.
- `signup-prompt` opens that prompt from Rate and offers Sign up and Log in.
- `review` saves a score and a note, edits the note, then deletes the note and keeps the score.
- `library-status` changes status with a request body that contains only `status`, leaving hours 12.5, play count 4, and the 100% flag set.
- `lists` adds the game to the existing wishlist and creates a list that contains the game.
- `keyboard` keeps Close on screen while the review field is focused in a short viewport.

## How to get to it (user POV)

- Open `http://localhost:8081/games/<slug>` while signed out. `<slug>` is one game peek has rated and logged.
- Tap Rate. The signup sheet opens. Close it.
- Open `http://localhost:8081/sign-in`, log in as peek, and open the same game.
- Tap Rate, pick a score, write a note, and submit. Open Rate again to edit the note, then delete the written review.
- Tap Save game, pick the other of Playing or Backlog, and update the library entry.
- Tap Add to list, tap the wishlist, then create a list named Phone Shelf.

## Driving it with verify-screenpeak

Preconditions:

- `node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs doctor` exits 0.
- The website API is `http://127.0.0.1:3210`. The database is local `screenpeak_verify_copy`.
- Port 8081 is free. The drive starts Expo web at `http://localhost:8081` and stops it before it exits. `--host localhost` listens on localhost, which is not `127.0.0.1` on this machine.
- `peek` has five ratings and five library games. You start signed out. The drive sets this game's hours to 12.5, play count to 4, and the 100% flag after sign-in, then restores the original rating, review, and library row.

- **Open the game signed out.** The drive opens `http://localhost:8081/games/<slug>` at 375×667. The screen shows the game name. The signup sentence is not showing.
- **Open the signup prompt.** Click the Rate control (its accessible name stays Rate when the visible label is Amend). The sheet says "Sign up to rate, log, or list this game." and shows Sign up. Click Close.
- **Log in.** Open `http://localhost:8081/sign-in`, fill Email and Password for peek, and click Log in.
- **Open the game signed in.** The screen shows the game name and Your score. The signup sentence is not showing.
- **Rate and review.** Click Rate, click a score, fill Review note with "Phone run one.", and click Submit rating. The page shows that sentence. Postgres stores that rating and that text.
- **Edit the review.** Click Rate, replace the note with "Phone run two.", and submit. The page and Postgres show the new sentence and the same rating.
- **Delete the written review.** Click Rate, click Delete review, then Delete the written review. The note is gone. The page still shows Your score with that rating. Postgres keeps the rating and an empty review.
- **Save library status.** Click Save game, click Log as playing or Log as backlog (the one peek does not already have), and click Update library entry. The page shows the new status. The PUT body is only `{ "status": "<that status>" }`. Postgres still has hours 12.5, play count 4, and the 100% flag.
- **Add to a list and create one.** Click Add to list, click Add to the wishlist name, and wait until that control's visible text includes the list name and "On this list". Postgres has one membership row. Fill New list name with Phone Shelf and List description with "From the phone", then click Create list. The sheet shows Phone Shelf. Postgres has that list with one game. Click Close.
- **Keyboard.** Click Rate, focus Review note, and shrink the viewport to 375×420. Close is inside the window, and the sheet still shows Review note.
- **Proof.** The drive writes `/tmp/screenpeak-verify/evidence/mobile-game/`. The png files are the signed-out page, the signup prompt, the signed-in page, the saved review, the edited review, the page after the note is deleted, the library status, the created list, and the short viewport. `result.json` records the review rows, the library PUT body, the library row, the wishlist count, and the created list. `postgres.txt` records the same reads. The drive then deletes Phone Shelf, removes the wishlist membership, and restores peek's rating and library row. Counts are 5 and 5.

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive mobile-game
```

## Gotchas

- The Rate control's visible label is Amend once a score exists. Click the accessible name Rate. Save game's visible label is the status. Click the accessible name Save game.
- Status rows include a description, so their visible text is not just Backlog or Playing. Click Log as backlog or Log as playing.
- There is no spoiler flag and no route that deletes a rating. Delete review sends the current score with an empty note.
- A status-only save must omit hours, play count, and the 100% flag. Sending those fields, even with the old values, is not this proof.
- Expo web has no software keyboard. The short viewport stands in for the keyboard covering the sheet. Close has to stay inside that viewport.
- The drive writes peek's library row and restores it, including after a failure. It also deletes Phone Shelf. `down` drops the database. Do not point this drive at a hosted database.
- Do not run this drive while another Expo drive is using port 8081.
