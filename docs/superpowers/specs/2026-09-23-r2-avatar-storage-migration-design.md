# Avatar storage migration: Supabase Storage → Cloudflare R2

## Goal

Move avatar uploads off Supabase Storage onto Cloudflare R2. Game cover art is
unaffected — those are RAWG-hosted URLs, never uploaded to Supabase Storage.
Avatars are the only thing in this app that lives in a storage bucket, so this
spec covers the whole migration, not just a slice of it.

## Scope

**In scope:** the avatar upload path end to end — client upload flow, the
server-side code that talks to storage, config (`next.config.ts`, env vars),
and the R2-side setup steps required to support it.

**Out of scope:**
- Backfilling existing users' avatars from Supabase Storage to R2. Decided
  explicitly: existing `avatar_url` values are left pointing at Supabase until
  each user re-uploads, which then goes through R2. Anyone who never
  re-uploads keeps a Supabase-hosted avatar until that bucket is decommissioned
  (a separate, later decision).
- Decommissioning the Supabase `avatars` bucket/policies. Not done as part of
  this change, since old `avatar_url` values still depend on it per the point
  above.
- Any change to game cover art handling (`media.rawg.io`) — untouched.

## Why presigned direct-to-R2 upload, not a server proxy

Today `AvatarUploader.tsx` (client) calls `uploadAvatarImage()` in
`lib/queries/user-auth.ts`, which uses the **browser** Supabase client to
upload straight to Supabase Storage — authorization comes from that bucket's
RLS policy. R2 has no equivalent browser SDK with row-level security, and its
S3-compatible API credentials must never reach the browser.

Two ways to bridge that gap: proxy the file bytes through a server
action/route handler, or have the server mint a short-lived presigned PUT URL
and let the browser upload directly to R2. This spec uses the presigned-URL
approach (the user's choice, weighed against the simpler server-proxy
alternative) — it keeps file bytes off the app server entirely, at the cost of
one extra piece of R2-side setup (CORS on the bucket) beyond what a proxy
would need.

## Architecture

- **`lib/r2.ts`** (new, server-only) — exports a singleton `S3Client`
  (`@aws-sdk/client-s3`) configured with R2's endpoint
  (`https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`) and credentials from
  env vars. Plays the same "server-only client, never imported by a `'use
  client'` file" role `lib/db.ts` plays for Postgres.
- **`app/user-actions.ts`** (existing file) gains
  `createAvatarUploadUrl(contentType: string, contentLength: number)`,
  alongside the existing `requireUser()`-gated actions (`saveAvatarUrl`,
  etc.). It:
  1. Calls `requireUser()` — throws `Unauthenticated` if not logged in, same
     as every other action in this file.
  2. Validates `contentType` against an allow-list (`image/png`, `image/jpeg`,
     `image/webp`) and maps it to a file extension itself — **not** the
     client-supplied filename. (Today's `uploadAvatarImage` trusts
     `file.name.split('.').pop()`; this closes that gap while we're already
     rewriting the function.) Rejects anything else.
  3. Validates `contentLength` against `MAX_AVATAR_BYTES` (2MB, the same
     limit `AvatarUploader.tsx` already checked client-side — both now read
     the one constant in `lib/avatar-upload.ts` instead of duplicating the
     number). A client-only size check does nothing against a direct caller
     of the Server Action, so the limit is also signed into the presigned
     URL as `ContentLength` on the `PutObjectCommand` — R2 then rejects any
     PUT whose actual `Content-Length` header doesn't match the value that
     was signed for, not just whatever the client claimed when asking for
     the URL.
  4. Both validation failures return `{ error: string }` rather than
     throwing. Found in code review: Next.js redacts a Server Action's
     thrown error message in production builds (the dev server where this
     was first manually verified does not redact them, which is exactly why
     it was missed) — a thrown "Unsupported image type" reached the user
     fine locally and became a generic, useless message in production. The
     validation-failure case now returns a discriminated result instead,
     the same way `saveAvatarUrl` already returns an error value rather than
     throwing. (`requireUser()`'s `Unauthenticated` throw is left as-is —
     that's the existing, file-wide pattern for every action here, not
     something this migration should change unilaterally.)
  5. Derives the object key as `${user.id}/avatar.${ext}` from the session —
     never client-supplied, so one user can't mint a URL that overwrites
     another user's avatar key.
  6. Generates a presigned PUT URL via `@aws-sdk/s3-request-presigner`, TTL 5
     minutes.
  7. Returns `{ uploadUrl, publicUrl }`, where `publicUrl` is
     `${R2_PUBLIC_URL}/${key}?v=${version}` — `version` is a fresh token
     (`Date.now()`) generated on every call. The key is stable per
     user+content-type by design (overwrite in place, no orphaned objects),
     so without a token that changes on every upload, re-uploading the same
     content-type produces the exact same URL as last time — indistinguishable,
     to a browser's HTTP cache or Next.js's built-in remote-image optimizer
     cache, from a cache hit on the previous upload's bytes. Found live during
     implementation: re-uploading the same content-type served stale cached
     images instead of the new one, even though R2 correctly held the new
     bytes and the DB correctly held the (unchanged) URL.
- **`AvatarUploader.tsx`** — keeps its existing client-side type/size
  validation (now reading `MAX_AVATAR_BYTES` from `lib/avatar-upload.ts`
  instead of a hardcoded `2 * 1024 * 1024`). Replaces the
  `uploadAvatarImage(supabase, userId, file)` call with: call
  `createAvatarUploadUrl(file.type, file.size)` → check for `{ error }` →
  `fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type':
  file.type } })` → on success, call the existing `saveAvatarUrl(publicUrl)`
  unchanged. The browser Supabase client import (`@/lib/supabase-browser`) is
  dropped from this file — it was only used for the storage call. The whole
  sequence (presign call, `PUT`, `saveAvatarUrl`) runs inside one
  `try/catch/finally`: found in code review that the original version left
  the `PUT`'s `fetch` call unguarded, so a network failure or CORS rejection
  (a `fetch` rejection, not just a non-`ok` response) threw past the existing
  error handling entirely — `setUploading(false)` never ran, and the button
  stayed stuck on "Uploading..." with no error shown until reload.
- **`lib/queries/user-auth.ts`** — `uploadAvatarImage` is deleted (dead once
  `AvatarUploader.tsx` no longer calls it). Everything else in that file
  (Auth calls) is untouched.
- **`next.config.ts`** — `images.remotePatterns` gains the R2 custom domain
  hostname (e.g. `cdn.screenpeak.gg`) **alongside**, not instead of, the
  existing `*.supabase.co/storage/v1/object/public/**` entry. The "no
  backfill" decision above only holds if old avatars keep rendering until
  each user re-uploads — dropping the Supabase pattern here would make
  `next/image` reject every existing avatar immediately, which is a much
  worse outcome than the deliberately-accepted one. Removing the Supabase
  pattern is a later, separate decision, made only once the Supabase bucket
  is actually decommissioned.

## Data flow

1. User picks a file in `AvatarUploader.tsx`; existing client-side type/size
   checks run unchanged.
2. Client calls `createAvatarUploadUrl(file.type, file.size)`.
3. Server: `requireUser()` → validate content-type → validate size → derive
   key → presign PUT URL (size signed in as `ContentLength`) → return
   `{ uploadUrl, publicUrl }` or `{ error }`.
4. Client `PUT`s the file directly to `uploadUrl` (goes straight to R2, never
   touches the Next.js server).
5. On a successful PUT, client calls `saveAvatarUrl(publicUrl)` (existing
   Server Action, unchanged) to persist `users.avatar_url`.
6. `next/image` renders `publicUrl` via the new `remotePatterns` entry.

## Config

New env vars (`.env.local`, gitignored — see "What you need to do" below for
where each one comes from):

| Var | Purpose |
|---|---|
| `R2_ACCOUNT_ID` | R2 API endpoint host |
| `R2_ACCESS_KEY_ID` | R2 API token, write access to the bucket |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `R2_BUCKET_NAME` | bucket the app uploads avatars into |
| `R2_PUBLIC_URL` | base URL avatars are served from, e.g. `https://cdn.screenpeak.gg` (no trailing slash) |

New dependencies: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.

`AGENTS.md`'s "External APIs" and "Env Vars" sections get updated to describe
R2 instead of "Supabase Storage — user avatars and game images" (game images
were always RAWG-hosted; that line was already slightly imprecise and this
migration is a natural point to fix it).

## Error handling

- `createAvatarUploadUrl` throws through `requireUser()`'s existing
  `Unauthenticated` error when logged out — same shape as every other action
  in `app/user-actions.ts`, no new error handling pattern introduced.
- Disallowed content-types and oversized files are rejected before any R2
  call is made, as a returned `{ error: string }` value — not thrown, since a
  thrown Server Action error's message is redacted in production builds.
- A failed direct PUT (expired presigned URL, CORS misconfiguration, network
  failure) surfaces through `AvatarUploader.tsx`'s existing `error` state —
  no new UI needed; retry re-runs the whole flow and gets a fresh URL. The
  whole upload sequence runs inside one `try/catch/finally` so a rejected
  `fetch` (not just a non-`ok` response) is caught too.

## Testing

- Vitest unit tests for the pure logic in `lib/avatar-upload.ts`: the
  content-type → extension allow-list, the public-URL builder (including the
  cache-busting version param), and `isValidAvatarSize` against
  `MAX_AVATAR_BYTES` — matches the existing characterization-suite style in
  `test/`.
- The end-to-end upload (presign → direct PUT → save) depends on real R2
  infrastructure (bucket, custom domain, CORS) and is verified manually in
  the browser once that infrastructure exists — not mocked in the unit suite.

## What you need to do before implementation starts

All of this is in the Cloudflare dashboard — none of it is something I can do
from the repo:

1. **Create the R2 bucket.** Cloudflare dashboard → R2 → Create bucket. Note
   the name you give it — that's `R2_BUCKET_NAME`.
2. **Create an R2 API token scoped to that bucket.** R2 → "Manage API Tokens"
   → Create API Token → permission "Object Read & Write", scoped to the
   bucket from step 1. This generates an **Access Key ID** and **Secret
   Access Key** — the secret is shown once, so save it immediately. These are
   `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.
3. **Get your Account ID.** Cloudflare dashboard → R2 → Overview — the
   Account ID is shown in the right-hand panel (also visible in the R2
   dashboard URL: `dash.cloudflare.com/<account-id>/r2/overview`). That's
   `R2_ACCOUNT_ID`.
4. **Bind a custom domain to the bucket — use a subdomain, not the apex.**
   Requires `screenpeak.gg` to already be an active zone on this Cloudflare
   account (it is). An R2 custom domain claims that exact hostname for
   object-storage traffic, so it can't be the apex `screenpeak.gg` — that
   hostname already routes to the app itself. Use a subdomain instead:
   bucket → Settings → Custom Domains → Connect Domain → enter something like
   `cdn.screenpeak.gg` (name is up to you — `images.`, `static.`, etc. all
   work equally well). Cloudflare provisions the CNAME and SSL automatically;
   it can take a few minutes to go active. Once active, `R2_PUBLIC_URL` is
   `https://<that subdomain>` (no trailing slash).
5. **Set a CORS policy on the bucket.** Bucket → Settings → CORS Policy → add
   a rule allowing only `PUT` (the presigned upload is the only request that
   goes browser → R2 API directly; avatars are served afterward through the
   custom domain as a plain `<img>`/`next/image` load, which isn't
   CORS-gated, so `GET`/`POST`/`DELETE` aren't needed here). Don't add
   `OPTIONS` — R2 answers CORS preflight automatically based on
   `AllowedMethods`, it isn't a method you declare. Set `AllowedHeaders` to
   `["*"]` — without it, the preflight fails because the upload sets a
   `Content-Type` header that a default (empty) allow-list rejects:
   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3000", "https://screenpeak.gg"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["*"]
     }
   ]
   ```
   Skipping this step is the one that's easy to miss and only surfaces later
   as a confusing upload failure.
6. **Add the five env vars to `.env.local`** (and to whatever hosts
   production env vars — Vercel project settings, etc.) once you have them
   from steps 1-4.

Once these are done, tell me and I'll implement against the design above.
