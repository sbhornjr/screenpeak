# Moderation: report and block — design

## Intent and why

Driven by Apple App Store Review Guideline 1.2 (User-Generated Content), not
by a specific incident. The guideline's exact text (verified against
`https://developer.apple.com/app-store/review/guidelines/`):

> To prevent abuse, such apps must include:
> - A method for filtering objectionable material from being posted to the app
> - A mechanism to report offensive content and timely responses to concerns
> - The ability to block abusive users from the service
> - Published contact information so users can easily reach you

ScreenPeak has user-generated content (reviews, list names/descriptions,
usernames, bios, avatars) and user-to-user interaction (follows), so this
applies. Currently the app has **none** of report, block, or any moderation
tooling — confirmed by grep, not assumed.

"Block abusive users from the service" means a user-facing block feature, not
just the developer's own ability to delete an account. Verified two ways:
the guideline lists it in parallel with "a mechanism to report offensive
content," which is unambiguously user-facing; and a real App Store rejection
thread (`https://developer.apple.com/forums/thread/807358`) shows a
developer's fix for this exact guideline was adding a "block this user from
their profile" button — not an admin panel. The project's existing account
deletion (`deleteAccount` in `apps/web/lib/account-deletion.ts`) satisfies a
*different* part of the guideline (the developer's obligation to act on
reports), not this bullet.

Given the driver is compliance, not a specific abuse scenario, the explicit
design philosophy for both report and block is **the minimum that actually
satisfies the guideline**, not a full trust-and-safety system.

## Goals

- A user can report: a review, a list's name or description, a user's
  username, bio, or avatar.
- A user can block another user, preventing a mutual follow relationship.
- Reports are durable (a DB row) and actually reach a human in a reasonable
  time (an email), satisfying "timely responses."
- Both features ship on web and mobile before either is considered done.

## Non-goals

- Automated content filtering (the guideline's first bullet). Decided:
  manual review via reports is the mechanism, same as most apps this size —
  not building a profanity/ML filter for v1.
- Hiding a blocked user's content anywhere it would normally appear (game
  pages, lists, feed, search). Blocking only prevents the follow
  relationship; explicitly rejected the "deeper" version during design.
- An in-app admin/moderation dashboard. Reports are reviewed by querying the
  `reports` table directly (Supabase dashboard or `psql`) — intentionally no
  UI for this in v1.
- Reporting anything other than the five listed content types above. No
  report-a-feed-item, no report-a-comment (there are no comments).

## Anti-goals

- A report or block flow that silently fails to notify anyone — the entire
  point of this feature is Apple's "timely responses" requirement, so the
  email path must actually work, not degrade silently to "nothing happened."
- Making the report button itself a harassment vector (unrate-limited mass
  reporting of one target). It must require sign-in and be rate-limited.
- An anonymous report. The reporter's identity is always included, both in
  the DB row and the email — this discourages abuse of the tool itself and
  gives the one human reviewing reports (the product owner) the context to
  judge a report's good faith.
- Notifying the blocked user that they were blocked. Silent, by design — no
  push, no in-app indicator to them.

## Decisions made (in conversation, recorded here as settled)

### Report

- **Entry points:** a flag icon, top-right, "Report" on hover, on reviews
  and on lists. The profile page gets its own Report icon (covering
  username, bio, and avatar — selected via the dropdown below) as a
  **separate icon from Block**, not a combined menu.
- **Modal:** a reason dropdown whose options are **context-specific to
  where it was opened from** (a review's dropdown shows review-shaped
  reasons; a list's shows list-name/list-description-shaped reasons; the
  profile's shows username/bio/avatar-shaped reasons), always ending in an
  "Other" option, plus a free-text details box, plus a Report button.
- **Access:** signed in only. Rate-limited, reusing the existing
  rate-limit infrastructure (`consumeApiRateLimit` / the pattern in
  `apps/web/lib/rate-limit.ts`) so the report tool can't itself be weaponized.
- **On submit:** writes one row to a new `reports` table (reporter id,
  target type, target id, reason, free-text details, timestamp) **and**
  sends an email to `support@screenpeak.gg` (confirmed live/monitored)
  containing the reporter's username, the reason, the details, and a direct
  link to the reported content. Both happen, not either/or — the DB row is
  the durable record; the email is what actually gets a human's attention in
  a reasonable time.
- **No report-status UI, no "you reported this" indicator needed for v1**
  beyond whatever confirmation the modal itself shows on submit.

### Block

- **Semantics:** one-directional initiation (A blocks B), symmetric effect
  — any existing follow in either direction is removed, and neither A nor B
  can follow the other again until B is unblocked.
- **No content hiding.** A blocked user's reviews, lists, and profile are
  still visible to a direct visit — this is purely a follow-relationship
  gate, not a visibility gate. (Explicitly the "simple" option chosen over
  the "deeper" one during design — do not expand scope here without
  checking back.)
- **No notification to the blocked user.**
- **UI:** a Block icon on the profile page, next to Report (separate
  icons, not a shared menu). A confirm-before-blocking dialog, consistent
  with this app's existing pattern for destructive/consequential actions
  (delete list, delete account, unlink Steam all confirm first).
- **Unblocking:** Settings gets a "Blocked users" list, showing who you've
  blocked, with an Unblock action. Without this, a block would be
  permanent, which was explicitly not the intent.

## Constraints / existing conventions this must follow

- **No transactional email capability exists today.** Supabase Auth's
  built-in sender only handles auth emails (confirm/reset/email-change) and
  cannot be used to send an arbitrary report notification. This needs a new
  provider — Resend is the natural choice, since it's already the one named
  in `ship-readiness.html`'s deploy checklist for this exact gap. This means:
  a new env var (e.g. `RESEND_API_KEY`), a new small `lib/email.ts`-style
  helper, and a line in `AGENTS.md`'s Env Vars section once it exists.
  **This is new infrastructure, not just a UI feature — size it as such.**
- New tables (`reports`, `blocks`) follow the existing authorization model:
  written via Drizzle (`lib/db.ts`), which bypasses RLS, so ownership/
  authorization checks belong in the query functions themselves
  (`requireUser()` / `requireBearerUser()` identifies the caller), the same
  as every other Drizzle-backed write in this app post-rearchitecture — see
  the corrected note on `ship-readiness.html`'s B4. Do not rely on RLS
  policies as the enforcement layer for these.
- `blocks` is modeled the same shape as `follows`
  (`apps/web/db/schema.ts` — `blockerId`, `blockedId`, `createdAt`, likely a
  composite PK, a CHECK that `blocker_id <> blocked_id` mirroring `follows`'
  existing `follows_check` constraint) — not the server-only-secret pattern
  used for `push_tokens`/`steam_link_intents` (`blocks` is ordinary
  user-facing app data, read and written through normal Server
  Actions/`/api/v1` routes, not a credential).
- `reports` needs `target_type` (`review` | `list` | `profile` — not a
  separate type per username/bio/avatar, since those are just different
  `reason` values under `profile`) and a polymorphic `target_id` (a review
  id, list id, or user id depending on `target_type`).
- Blocking must integrate with the existing `followUser`/`unfollowUser`
  path in `apps/web/lib/queries/user.ts` (the single shared function both
  the website's Server Actions and the phone's `/api/v1` routes already call)
  — a block needs to (a) delete any existing follow rows between the two
  users and (b) make a subsequent `followUser` call between them a **silent
  no-op**, not an explicit rejection. This follows directly from "no
  notification to the blocked user": a visible "you can't follow this
  person, they've blocked you" error would itself be a notification, just
  an indirect one. Neither side sees a distinguishing error — `followUser`
  simply doesn't create the row, the same shape as any other silently-ignored
  duplicate call elsewhere in this codebase (e.g. `onConflictDoNothing`).
- **Report rate limiting must be its own bucket, not the shared 60/60s write
  budget.** The generic `consumeWriteRateLimit` budget is shared across
  every write a user makes — it would still allow dozens of reports against
  one target inside a single window, which doesn't satisfy this doc's own
  anti-goal (the report button becoming a harassment vector). Use the same
  `consumeApiRateLimit` primitive with a dedicated bucket keyed on the
  reporter (e.g. `report:<reporterId>`), at a materially tighter limit than
  the write budget — a sensible starting point is single digits per hour,
  correctable later without a design change.
- **The same rate limit must be enforced on both the web Server Action and
  the mobile `/api/v1` route for report/block/unblock — not just the API
  route.** `test/api/v1-routes-auth.test.ts` only scans files under
  `app/api/v1/`, and the existing `followUser` precedent has no rate limit
  on its web Server Action path at all (follows aren't rate-limited today).
  Report and block are different: this doc's anti-goals require the
  protection on both platforms, so both call sites must call the limiter
  explicitly — don't rely on the existing test to catch a web-only gap,
  since it doesn't look there. Worth a new test asserting this if one
  doesn't already generalize to cover it; left to the builder to decide
  where that test lives.
- New write endpoints (block, unblock, report) follow the established
  `/api/v1` pattern: `requireBearerUser()`, `consumeWriteRateLimit`, the
  `{ error: { code, message } }` shape via `ApiError`
  (`@screenpeak/shared/api/errors`) — same as every other v1 write route.
- Ship on both platforms together, per explicit instruction — this is not
  "web first, mobile later."

## What's left to the builder

- Exact `reports`/`blocks` table DDL and the next migration file/journal
  entry (follow `db/migrations/0013_push_tokens.sql` as the structural
  template for a new server-adjacent table).
- The Resend integration details: which Resend API surface, template vs.
  plain text email, error handling if the email send fails (the DB row must
  still be written even if the email fails — don't let an email provider
  outage silently drop a report).
- The exact dropdown reason lists per context (review / list / profile) —
  the design above gives the shape, not the final copy.
- Where exactly the Report/Block icons sit relative to other profile-page
  controls (Follow button, etc.) and the review/list card layout, within
  existing design tokens.
- The "Blocked users" Settings screen's exact layout, on both platforms.
- Tests, following this codebase's established conventions for new
  `/api/v1` write routes (`test/api/writes.test.ts`'s pattern) and
  Drizzle-backed query functions (mocked `db`, as in
  `test/lib/queries/push.test.ts` or `test/lib/queries/follow-notifies.test.ts`).
