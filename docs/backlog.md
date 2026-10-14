# Backlog

Open product items. The hosted IGDB catalogue is already in place.

## Steam import

1. **Steam 100% achievement checkmark.** The checkmark is filled in only after matching has finished, and some games the owner has 100% complete still lack it. No false positives have shown up. First paint does not call Steam for achievements. Only apps newly mapped in the current batch are checked. A non-2xx response, a game with no stats, a private profile, or a timed-out request is stored as not complete, and an existing library flag is kept. The check is capped so a silent Steam stats response cannot hold the import. Likely split: a game already in the catalogue is not treated as newly mapped, or the achievement fetch times out and skips it.

2. **Times Played stepper minimum is 1.** On the Steam import row (`GameFromSteam`) and the library editor (`LibraryButton`), Times Played uses `min="1"` and `Math.max(1, …)`. It cannot be set to 0, and decrement at 0 jumps back to 1. Hours Played is a number field with `min="0"` and no minus button, and that control is fine.

3. **Name the Steam apps that did not become their own ready row.** The match banner counts unmatched apps and, separately, apps that matched more than one game. It does not list those names. It also does not name apps that collapsed onto a game already in the ready list (two Steam apps, one catalogue row). The negative cache stores the Steam app id only.

4. **Import status logic.** Any game with more than 0 Steam hours becomes Playing. Revisit that, for example with achievements, how recently it was played, and playtime thresholds, so a finished game does not have to be marked Completed by hand.

5. **Edition and variant duplicates in the catalogue.** The same title can land twice, for example The Outer Worlds and The Outer Worlds: Spacer's Choice Edition, or The Walking Dead and its Definitive Edition. Decide whether import and the top-games seed should collapse an edition onto the parent game (`version_parent` / `game_type`). Steam import currently keeps editions and expansions as their own games. The bulk seed stores main games (`game_type = 0`) only.

## Library and pages

6. **Game page back button.** The control labelled Games always goes to `/games`. It should return to the referring page, such as Library.

7. **Loadout Read-Out inputs.** Add hours played and 100% achievement status to the inputs sent to the Loadout Read-Out model.

8. **Signed-out splash page.** `/` needs a first screen now that there is no hero game.

9. **Loadout Read-Out on the splash page, before launch.** Show a real Read-Out at the bottom of `/`. Hard-coding it to the owner's library is enough.

## Before launch

10. **IGDB commercial partnership.** A written partnership has to cover storage, caching, and attribution. The Twitch Developer Agreement defaults to 24-hour caching. The free noncommercial documentation is not permission to ship. The footer already credits IGDB. See `docs/igdb.md`.
