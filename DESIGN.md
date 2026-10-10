# ScreenPeak Design System

Internal reference for ScreenPeak's visual identity. No name for this system is
user-facing — see **Naming Conventions** below before introducing any new terminology.

## 1. Concept

**ScreenPeak** is screen-peeking: leaning over to see what your friends are
playing, and how they scored it. The product was renamed from "NG+" over a
trademark conflict; the art direction was retuned at the same time.

The design is built outward from two things nothing else in this space has:

- **You and the community.** Every game shows two scores, both out of 10: yours
  and the ScreenPeak community average, laid out **side by side**, not collapsed
  to one number. Your score is lit up and seamed, called out against the community.
- **Loadout.** An LLM-written "gamer identity" paragraph generated from a user's
  real library/rating data.

Palette, type, and geometry come from the **split screen** — a couch-multiplayer
memory (GoldenEye, Mario Kart, Halo LAN nights) rendered with restraint: a cool
CRT-graphite ground, one electron-beam cyan treated as phosphor light, and a thin
seam that divides one thing from another. Do **not** take this literally into
costume territory — no scanline overlays, no pixel fonts, no chrome bevels. The
direction lives in structure and colour, not decoration.

## 2. Naming Conventions

- **"Loadout"** is a real feature name (the AI-identity page). It's allowed to be
  a little unusual because nothing else occupies that name.
- **"Split screen"** is *not* a product name. It's the internal/design-system
  name for this aesthetic direction (the palette, type, seam motif) — used only
  in code comments and design discussion, never in UI copy or page titles.
- **"Library"** stays "Library." Every game platform already uses this word
  correctly; renaming it for vocabulary-cohesion reasons costs real clarity for
  no gain. Don't rename established, correctly-expected nouns just to sound more
  "on brand" — save distinctive naming for things that don't already have an
  expected name (like Loadout).
- Present-tense, "right now" language is on-brand for discovery surfaces —
  "Peak right now", "Lists peaking now" — playing on *peak* as "at its height."
- Internal identifiers keep their history: `ngplus_rating` (sort key),
  `avg_ngplus_rating` (DB column), the `ngplus:plus1` event. These are wiring,
  not UI — don't rename them for the rebrand.

## 3. Color

All colors are CSS custom properties in `app/globals.css` under `:root`. Always
reference the token (`bg-(--color-x)`, `var(--color-x)`), never a hardcoded hex —
that's what makes retuning the palette a one-file change.

| Token | Hex | Role |
|---|---|---|
| `--color-bg` | `#101215` | Page background — cool near-black, faint graphite/blue undertone (not brown, not neutral gray) |
| `--color-surface` | `#181b20` | Card/panel background |
| `--color-surface-light` | `#21252b` | Subtle fill — placeholder images, hover backgrounds |
| `--color-border` | `#313640` | Hairline borders, dividers |
| `--color-border-bright` | `#495060` | Emphasized border |
| `--color-accent` | `#47c6dd` | Interactive colour — links, primary buttons, focus/hover, the seam. Electron-beam cyan; cool, not icy-pastel |
| `--color-accent-hover` | `#6ad6e9` | Hover/pressed state for accent-coloured elements |
| `--color-text` | `#dfe3ea` | Primary text — cool phosphor white, not stark white |
| `--color-muted` | `#8b919d` | Secondary text, metadata, captions |

**Score colours** (`--color-community` / `--color-you`) — used *only* by the
stat compare (`StatCompare`):

| Token | Hex | Role |
|---|---|---|
| `--color-you` | = `--color-accent` | You, lit cyan |
| `--color-community` | `#9aa1ad` | The community, cool grey |

**Rating-tier colours** (`--color-good` / `--color-mid` / `--color-bad`) are a
separate semantic set, used for score *values* on cards / distributions and
nowhere else:

| Token | Hex | Meaning |
|---|---|---|
| `--color-good` | `#4f86c6` | Score ≥ 8 (kept a true cornflower blue, distinct from the cyan accent) |
| `--color-mid` | `#e0a13f` | Score 6–7 |
| `--color-bad` / `--color-bad-hover` | `#e0574c` / `#b0433a` | Score < 6, and destructive actions (delete account, remove from library) |

**Why amber/grey/red for tiers, not shades of one hue:** an earlier
version used three shades of the same warm hue differing mainly in lightness —
hard to read for color-blind users. The current sets use genuinely different
hues so the distinction survives regardless, and the numbers stay the source of
truth. A 4th semantic colour, if ever needed, should sit outside this
blue/amber/red/grey family.

**Contrast against cover art:** the rating tag (`Seal`) sits on unpredictable,
often busy game art. Its background is a near-opaque dark fill
(`rgba(11,13,16,0.9)`), not a light tint — deliberate; a transparent fill was
unreadable on bright/saturated covers. Keep any future overlay-on-photo element
near that opacity.

## 4. Typography

Three font roles, each with a distinct job.

| Role | Font | Variable | Used for |
|---|---|---|---|
| Display | Chakra Petch (semi-condensed, has italic) | `--font-display` | Headings, card titles, the Loadout headline. A screen-readout face — reads like a game HUD without being a costume |
| Body | IBM Plex Sans | `--font-body` | Prose — reviews, bios, descriptions |
| Mono | IBM Plex Mono | `--font-mono` | **Every number**: ratings, hours played, dates, stat values, badge labels |

The mono rule is a real convention: any numeric/data value in the UI (a rating,
a play count, a timestamp, a stat figure) renders in
`font-(family-name:--font-mono)`, tracked-out and uppercase for labels. This is
what makes numbers read as consistent "readout" entries across the app. Prose
never uses mono.

`h1`–`h6` are bound to `--font-display` globally in `globals.css`; most existing
code still repeats `font-(family-name:--font-display)` explicitly for clarity —
match that style.

## 5. Geometry

One flat corner radius everywhere non-circular: **`rounded-[3px]`**. Cards,
buttons, modals, inputs, image frames, tag pills, dropdowns — everything. It
replaced a mix of `rounded-lg`/`xl`/`2xl` that read as generic soft SaaS chrome.

Stay circular (`rounded-full`) only for actually-round objects — avatars
(`Avatar.tsx`). Everything else, the rating tag (`Seal.tsx`) included, takes the
flat radius.

Progress-bar-style fills (rating distribution bars) use `rounded-[1px]`, not
`rounded-full` — a pill-shaped thin bar reads as a loading indicator.

## 6. Signature devices

### The Seam

A **2px vertical cyan bar** — the divider between two screens. It's the recurring
structural marker:

- Precedes the label in `SectionHead` (`app/components/util/SectionHead.tsx`) and
  page `Eyebrow` (`app/components/util/Eyebrow.tsx`) — always use these, don't
  re-roll the markup.
- Divides the wordmark: `Screen` (text) | seam | `Peak` (accent), in
  `app/components/util/Wordmark.tsx`.
- Brackets the lit "You" column in `StatCompare`.

It replaced an earlier `▸` menu-cursor glyph everywhere that glyph appeared.

### The Seal (rating tag)

`app/components/game/Seal.tsx`. A flat `rounded-[2px]` cell on a game's cover:
near-opaque dark fill, thin bright border, and a 2px tier-coloured hairline along
the bottom — a HUD score readout, not an ink stamp (it used to be a rotated
dashed circle; that was the old ledger direction). Source label (`SP` /
`You`) small and tracked above the number; number bold, mono, tier-coloured. A
`min-w` keeps the footprint fixed so `8`, `8.5` and `10` don't reflow. Appears
anywhere a game's score sits on top of its cover art: `GameCard`, `FeedGameCard`,
`FeedReview`. It intentionally does **not** appear in text-row contexts
(`Review.tsx`, `ReviewPageRating.tsx`) — there a plain colour + `--font-mono`
number is enough.

Placement convention: **right side = the ScreenPeak community score**, **left
side = the viewer's own score**. An unrated game shows no community tag. Two
tags only where the cover is wide enough (`GameCard`); the feed's 80px
thumbnail (`FeedGameCard`) shows one, preferring the community score, then You,
since the feed line already states the rating. The landing-page hero shows the
community score only.

### The Folio (CoverFan)

`app/components/lists/CoverFan.tsx`. Renders a list's covers as an overlapping,
individually-tilted fan (`-9deg` to `8deg`, alternating) instead of a flat grid —
a hand of cards / stack of physical media. Used by `ListPreview` (`size="lg"`)
and `FeedListPreview` (default `size="md"`).

Two things that look like bugs but are load-bearing:
- **`imgSizes` is deliberately larger than the rendered box** (140px request for
  an 80px box, 220px for a 112px box). These images are rotated in CSS; an
  exactly-matched request looks visibly soft resampled at an angle. Don't "fix"
  this down.
- **Rotation uses the CSS-custom-property trick** (`rotate-[var(--fan-rotate)]` +
  inline `style` setting `--fan-rotate`), not a literal Tailwind class per index.
  A fixed small array of literal rotation classes works too (Tailwind scans raw
  source); use the CSS-variable pattern if values are ever generated dynamically.

Empty lists (0 games) show a single dashed-outline placeholder box in the folio
footprint, muted uppercase mono text ("No games yet") — never blank space. Same
for `GameCard`'s missing-cover state: faint diagonal-hatch + "No Cover" in
tracked mono.

## 7. Component patterns

- **Catalog card** (`GameCard`): cover art, up to two `Seal`s, then title over a
  1px hairline / developer+year (mono) / play stats (mono). Base pattern other
  card types riff on.
- **Stat tiles** (`StatGrid`, inline stat cards on `Loadout`): value in
  `--color-good` + mono, label in tracked-uppercase muted mono underneath.
- **The +1 tic** (`lib/plus1.ts` → `Plus1Layer`): a `+1 LABEL` chip floats up the
  screen like XP gain. Fire it only on a new, first-time, durable write to the
  user's own data — `SAVED` / `COMPLETED` / `RATED` / `LISTED` / `NEW LIST` /
  `FAVORITED`. Silent on edits, removals, follows, and anything about other
  people.
- **Sample copy** (the Loadout identity paragraph; the landing "your read-out,
  previewed"): a card with a tracked-uppercase mono eyebrow and the content in
  italic display type. Anything shown as a *sample* rather than real user data
  carries an explicit "Example ___"-style eyebrow — never let illustrative copy
  pass as real.

## 8. Do's and Don'ts

**Do**
- Reference colour/font tokens, never hardcode a hex or font name.
- Put every number in `--font-mono`.
- Use the seam via `Eyebrow` / `SectionHead`; use `Wordmark` for the logo.
- Keep the `rounded-[3px]` radius uniform; only avatars stay round.
- Show an empty state (dashed placeholder + short mono label) instead of blank
  space when a collection is empty.
- Ground any new visual device in something ScreenPeak actually does (rating,
  logging, reviewing, peeking at friends) before reaching for a generic motif.

**Don't**
- Don't take the split-screen literally — no scanline overlays, pixel fonts, or
  bevelled chrome. Structure and colour only.
- Don't introduce pill-shaped buttons or Spotify-style pill-and-circle geometry.
- Don't rename established, correctly-understood nouns (Library, etc.) for
  branding cohesion.
- Don't use "split screen" (the system name) in user-facing copy.
- Don't apply the Seal tag to non-image text rows (plain mono number there).
- Don't undersize an `Image`'s `sizes` prop to exactly match its rendered box if
  that box is rotated or scaled on hover — request headroom.
