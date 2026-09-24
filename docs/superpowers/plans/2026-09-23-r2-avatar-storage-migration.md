# R2 Avatar Storage Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move avatar uploads off Supabase Storage onto Cloudflare R2, using a presigned direct-to-R2 PUT so R2 credentials never reach the browser.

**Architecture:** A server-only R2 client (`lib/r2.ts`, mirrors `lib/db.ts`'s role) mints a short-lived presigned PUT URL from a new `requireUser()`-gated Server Action. The browser PUTs the file straight to R2, then calls the existing `saveAvatarUrl` action to persist the resulting public URL — the same two-step shape `AvatarUploader.tsx` already uses today, just swapping the storage backend.

**Tech Stack:** `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` (R2's S3-compatible API), Next.js Server Actions, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-23-r2-avatar-storage-migration-design.md`

## Global Constraints

- Presigned direct-to-R2 upload only — no file bytes proxied through the Next.js server (spec's explicit choice over a server-proxy alternative).
- No backfill of existing avatars — `avatar_url` values already pointing at Supabase Storage are left untouched; only new uploads go through R2.
- Env vars, exact names: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`. Already set in `.env.local` and production per the user.
- Allowed avatar content types: `image/png`, `image/jpeg`, `image/webp` only — anything else rejected before any R2 call.
- Object key format: `${userId}/avatar.${ext}`, derived server-side from `requireUser()`'s session — never a client-supplied id or filename.
- Presigned URL TTL: 5 minutes.
- Server-only modules (anything importing `@aws-sdk/*`) must never be imported by a `'use client'` file — same bundle-separation rule `AGENTS.md` documents for `lib/db.ts` (a Node-only import reaching the client bundle breaks the build).
- No code comments except where AGENTS.md's existing precedent already requires one (e.g. explaining a non-obvious bundle-separation constraint).

## Review Focus

- A file whose browser-reported MIME type starts with `image/` but isn't in the server's three-type allow-list (`image/svg+xml`, `image/gif`, `image/bmp`, `image/avif`, ...) must be rejected with a clear, user-visible error, not an unhandled server exception. → pinned by Task 1's `getAvatarKeyForUpload` tests (returns `null` for unlisted types) and manually verified in Task 3 (upload a `.gif`, expect the error text, not a crash).
- `R2_PUBLIC_URL` configured with a trailing slash must not produce a double slash in the served avatar URL. → pinned by Task 1's `buildAvatarPublicUrl` test.
- The `Content-Type` header on the direct `PUT` to R2 must exactly match what was presigned for (R2/S3 signs `ContentType` into the URL) or the upload fails with a signature error. → Task 3 passes `file.type` as the single source of truth to both the presign call and the `PUT`'s header, never re-derived.
- A logged-out call to `createAvatarUploadUrl` must throw before any R2 interaction, via the same `requireUser()` used by every other action in `app/user-actions.ts` — not a new, separately-implemented auth check. → structural: Task 2's action calls `requireUser()` first, matching every neighboring action in the file.
- A user must not be able to mint an upload URL for another user's avatar key. → structural: `createAvatarUploadUrl` takes no `userId` parameter at all; the key is derived only from `requireUser()`'s session inside the action.

---

## File Structure

- **`lib/avatar-upload.ts`** (new) — pure, unit-tested logic: content-type → extension allow-list, key derivation, public-URL joining. No AWS SDK import, no env var reads — this is what makes it testable without R2 credentials.
- **`lib/r2.ts`** (new) — server-only: constructs the `S3Client` from env vars (throws at module load if any are unset, same pattern as `lib/db.ts`), and `createPresignedAvatarUploadUrl`, which wraps `lib/avatar-upload.ts`'s pure logic plus the actual presign call. Not unit-tested — same class as `lib/db.ts` and the untested `lib/queries/*` wrappers around external systems.
- **`app/user-actions.ts`** (modify) — new `createAvatarUploadUrl` Server Action, following the file's existing `requireUser()`-first pattern.
- **`lib/queries/user-auth.ts`** (modify) — `uploadAvatarImage` deleted; it's replaced by the two files above.
- **`app/components/user/AvatarUploader.tsx`** (modify) — swaps the direct Supabase Storage call for presign-then-PUT-then-save; drops the now-unused browser Supabase client import.
- **`app/settings/page.tsx`** (modify) — drops the `userId` prop passed to `AvatarUploader`, which no longer needs it (the server derives identity itself).
- **`next.config.ts`** (modify) — `images.remotePatterns` swaps the Supabase storage host for the R2 custom domain.
- **`AGENTS.md`** (modify) — "External APIs" and "Env Vars" sections updated to describe R2 instead of Supabase Storage for avatars; the `lib/queries/user-auth.ts` bullet's `uploadAvatarImage` example is removed.

---

## Task 1: R2 client and pure upload-target logic

**Files:**
- Modify: `package.json` (new dependencies)
- Create: `lib/avatar-upload.ts`
- Create: `lib/r2.ts`
- Test: `test/lib/avatar-upload.test.ts`

**Interfaces:**
- Produces (from `lib/avatar-upload.ts`, consumed by `lib/r2.ts` in this task and directly testable):
  - `getAvatarKeyForUpload(userId: string, contentType: string): { key: string; ext: string } | null`
  - `buildAvatarPublicUrl(publicBaseUrl: string, key: string): string`
- Produces (from `lib/r2.ts`, consumed by Task 2's Server Action):
  - `createPresignedAvatarUploadUrl(userId: string, contentType: string): Promise<{ uploadUrl: string; publicUrl: string } | null>` — resolves `null` when `contentType` isn't in the allow-list.
- Consumes: env vars `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` (already set by the user).

- [ ] **Step 1: Install the R2 SDK dependencies**

Run: `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`

- [ ] **Step 2: Write the failing test for the pure upload-target logic**

Create `test/lib/avatar-upload.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { getAvatarKeyForUpload, buildAvatarPublicUrl } from '@/lib/avatar-upload'

describe('getAvatarKeyForUpload', () => {
    it('maps image/png to a .png key', () => {
        expect(getAvatarKeyForUpload('user-1', 'image/png')).toEqual({
            key: 'user-1/avatar.png',
            ext: 'png',
        })
    })

    it('maps image/jpeg to a .jpg key', () => {
        expect(getAvatarKeyForUpload('user-1', 'image/jpeg')).toEqual({
            key: 'user-1/avatar.jpg',
            ext: 'jpg',
        })
    })

    it('maps image/webp to a .webp key', () => {
        expect(getAvatarKeyForUpload('user-1', 'image/webp')).toEqual({
            key: 'user-1/avatar.webp',
            ext: 'webp',
        })
    })

    it('returns null for a content type outside the allow-list, even one that looks like an image', () => {
        expect(getAvatarKeyForUpload('user-1', 'image/svg+xml')).toBeNull()
        expect(getAvatarKeyForUpload('user-1', 'image/gif')).toBeNull()
        expect(getAvatarKeyForUpload('user-1', 'text/plain')).toBeNull()
    })

    it('derives the key from the given userId, never a fixed or shared value', () => {
        expect(getAvatarKeyForUpload('user-2', 'image/png')?.key).toBe('user-2/avatar.png')
    })
})

describe('buildAvatarPublicUrl', () => {
    it('joins a base URL and key with a single slash', () => {
        expect(buildAvatarPublicUrl('https://cdn.screenpeak.gg', 'user-1/avatar.png'))
            .toBe('https://cdn.screenpeak.gg/user-1/avatar.png')
    })

    it('trims a trailing slash on the base URL to avoid a double slash', () => {
        expect(buildAvatarPublicUrl('https://cdn.screenpeak.gg/', 'user-1/avatar.png'))
            .toBe('https://cdn.screenpeak.gg/user-1/avatar.png')
    })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run test/lib/avatar-upload.test.ts`
Expected: FAIL — `lib/avatar-upload.ts` doesn't exist yet (`Cannot find module '@/lib/avatar-upload'`).

- [ ] **Step 4: Implement `lib/avatar-upload.ts`**

```typescript
const AVATAR_CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
}

export function getAvatarKeyForUpload(userId: string, contentType: string): { key: string; ext: string } | null {
    const ext = AVATAR_CONTENT_TYPE_EXTENSIONS[contentType]
    if (!ext) return null
    return { key: `${userId}/avatar.${ext}`, ext }
}

export function buildAvatarPublicUrl(publicBaseUrl: string, key: string): string {
    return `${publicBaseUrl.replace(/\/+$/, '')}/${key}`
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/lib/avatar-upload.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Implement `lib/r2.ts`**

```typescript
// Server-only: constructs an S3Client via the @aws-sdk packages, which pull in
// Node built-ins. Never import this from a 'use client' file — same bundle-
// separation constraint lib/db.ts documents for the Drizzle/postgres client.
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getAvatarKeyForUpload, buildAvatarPublicUrl } from '@/lib/avatar-upload'

const accountId = process.env.R2_ACCOUNT_ID
const accessKeyId = process.env.R2_ACCESS_KEY_ID
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
const bucketName = process.env.R2_BUCKET_NAME
const r2PublicUrl = process.env.R2_PUBLIC_URL

if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !r2PublicUrl) {
    throw new Error('R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_URL must all be set')
}

const s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
})

const AVATAR_UPLOAD_TTL_SECONDS = 300

export async function createPresignedAvatarUploadUrl(
    userId: string,
    contentType: string,
): Promise<{ uploadUrl: string; publicUrl: string } | null> {
    const target = getAvatarKeyForUpload(userId, contentType)
    if (!target) return null

    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: target.key,
        ContentType: contentType,
    })

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: AVATAR_UPLOAD_TTL_SECONDS })

    return { uploadUrl, publicUrl: buildAvatarPublicUrl(r2PublicUrl, target.key) }
}
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors from `lib/r2.ts` or `lib/avatar-upload.ts`. (This is the only verification for `lib/r2.ts` itself — it requires live R2 credentials to exercise at runtime, so per this project's testing convention for external-system wrapper files, it isn't unit-tested; Task 3's manual browser check exercises it end to end.)

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json lib/avatar-upload.ts lib/r2.ts test/lib/avatar-upload.test.ts
git commit -m "Add R2 client and avatar upload-target logic"
```

---

## Task 2: `createAvatarUploadUrl` Server Action

**Files:**
- Modify: `app/user-actions.ts`
- Modify: `lib/queries/user-auth.ts:29-43` (delete `uploadAvatarImage`)

**Interfaces:**
- Consumes: `createPresignedAvatarUploadUrl` from `lib/r2.ts` (Task 1), `requireUser` from `lib/auth.ts` (existing).
- Produces: `createAvatarUploadUrl(contentType: string): Promise<{ uploadUrl: string; publicUrl: string }>` — Server Action. Throws `Unauthenticated` (via `requireUser()`) if not logged in; throws `Error('Unsupported image type')` if `contentType` isn't in the allow-list. Consumed by Task 3's `AvatarUploader.tsx`.

- [ ] **Step 1: Add the action to `app/user-actions.ts`**

Add the import alongside the existing one:

```typescript
import { createPresignedAvatarUploadUrl } from '@/lib/r2'
```

Add the action (place it near `saveAvatarUrl`, which it precedes in the upload flow):

```typescript
export async function createAvatarUploadUrl(contentType: string) {
    const user = await requireUser()
    const result = await createPresignedAvatarUploadUrl(user.id, contentType)
    if (!result) throw new Error('Unsupported image type')
    return result
}
```

- [ ] **Step 2: Delete `uploadAvatarImage` from `lib/queries/user-auth.ts`**

Remove lines 29-43 (the whole function, including its blank line before `signInWithPassword`):

```typescript
export async function uploadAvatarImage(supabase: SupabaseClient, userId: string, file: File): Promise<string> {
    const filePath = `${userId}/avatar.${file.name.split('.').pop()}`

    const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true })

    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

    return publicUrl
}
```

Leave the rest of the file (the `SupabaseClient` type import, `getViewer`, `signInWithPassword`, etc.) untouched — they're unrelated Auth calls.

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (No new automated test here — Server Actions are integration territory per `test/README.md`; every other file in `app/*-actions.ts` is untested for the same reason. Task 3's manual verification exercises this action end to end.)

- [ ] **Step 4: Commit**

```bash
git add app/user-actions.ts lib/queries/user-auth.ts
git commit -m "Add createAvatarUploadUrl Server Action, remove Supabase Storage upload"
```

---

## Task 3: Wire up `AvatarUploader.tsx`, drop the `userId` prop, update `next.config.ts`

**Files:**
- Modify: `app/components/user/AvatarUploader.tsx`
- Modify: `app/settings/page.tsx:41`
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: `createAvatarUploadUrl(contentType: string)`, `saveAvatarUrl(url: string)` from `app/user-actions.ts` (Task 2).

- [ ] **Step 1: Rewrite `AvatarUploader.tsx`**

```tsx
'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createAvatarUploadUrl, saveAvatarUrl } from '@/app/user-actions'
import Avatar from '@/app/components/user/Avatar'

export default function AvatarUploader({ currentAvatarUrl, username }: {
    currentAvatarUrl: string | null
    username: string
}) {
    const [uploading, setUploading] = useState(false)
    const [preview, setPreview] = useState<string | null>(currentAvatarUrl)
    const [error, setError] = useState('')
    const fileInputRef = useRef<HTMLInputElement>(null)
    const router = useRouter()

    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

        // Validate file type and size
        if (!file.type.startsWith('image/')) {
            setError('Please upload an image file')
            return
        }
        if (file.size > 2 * 1024 * 1024) {
            setError('Image must be under 2MB')
            return
        }

        setError('')
        setUploading(true)

        let uploadUrl: string
        let publicUrl: string
        try {
            const result = await createAvatarUploadUrl(file.type)
            uploadUrl = result.uploadUrl
            publicUrl = result.publicUrl
        } catch (uploadError) {
            const message = uploadError instanceof Error ? uploadError.message : String(uploadError)
            setError('Upload failed: ' + message)
            setUploading(false)
            return
        }

        const putResponse = await fetch(uploadUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type },
        })

        if (!putResponse.ok) {
            setError('Upload failed: could not reach storage')
            setUploading(false)
            return
        }

        // Update user's avatar_url in the database
        const updateError = await saveAvatarUrl(publicUrl)

        if (updateError) {
            setError('Failed to save avatar')
            setUploading(false)
            return
        }

        setPreview(publicUrl)
        setUploading(false)
        router.refresh()
    }

    return (
        <div className="flex flex-col items-center gap-2">
                <Avatar src={preview} alt={username} size="lg" />

                <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="text-xs text-(--color-muted) hover:text-(--color-accent) transition-colors duration-200"
                        >
                        {uploading ? 'Uploading...' : 'Change Avatar'}
                </button>

                <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                />

                {error && <p className="text-xs text-(--color-bad)">{error}</p>}
        </div>
    )
}
```

Note what changed from the current file: the `userId` prop is gone (the server derives identity from the session now), the `@/lib/supabase-browser` import is gone (no direct storage call from the client anymore), and `handleFileChange` does presign → `PUT` → `saveAvatarUrl` instead of one `uploadAvatarImage` call.

- [ ] **Step 2: Update the call site in `app/settings/page.tsx`**

Change line 41 from:

```tsx
<AvatarUploader userId={user.id} username={user.username} currentAvatarUrl={user.avatar_url} />
```

to:

```tsx
<AvatarUploader username={user.username} currentAvatarUrl={user.avatar_url} />
```

- [ ] **Step 3: Update `next.config.ts`'s remote patterns**

Change:

```typescript
            {
                protocol: 'https',
                hostname: '*.supabase.co',
                pathname: '/storage/v1/object/public/**',
            },
```

to your actual R2 public hostname, e.g.:

```typescript
            {
                protocol: 'https',
                hostname: 'cdn.screenpeak.gg',
            },
```

(Use whatever subdomain you actually bound in the Cloudflare dashboard — check `R2_PUBLIC_URL` in `.env.local` for the exact hostname.)

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors, no unused-import warnings.

- [ ] **Step 5: Manually verify in the browser**

This task's correctness depends on live R2 infrastructure (bucket, custom domain, CORS), so it's verified manually rather than mocked:

1. Run: `npm run dev`
2. Sign in, go to `/settings`.
3. Click "Change Avatar", pick a `.png` or `.jpg` under 2MB. Confirm: no error shown, the avatar updates to the new image, and its `src` (inspect element) points at your R2 custom domain, not `*.supabase.co`.
4. Refresh the page. Confirm the new avatar persists (proves `saveAvatarUrl` wrote the R2 URL to the DB and `next/image` successfully loads a cross-origin image from the new `remotePatterns` entry).
5. Try uploading a `.gif` (still passes the client's `image/*` check, but isn't in the server allow-list). Confirm you see "Upload failed: Unsupported image type", not a crash or a silent no-op — this is the Review Focus item about MIME types that look like images but aren't supported.
6. Re-upload a second `.png` over the first. Confirm it replaces the avatar (same key, same extension → overwrite, no orphaned object).

- [ ] **Step 6: Commit**

```bash
git add app/components/user/AvatarUploader.tsx app/settings/page.tsx next.config.ts
git commit -m "Wire AvatarUploader to R2 presigned upload flow"
```

---

## Task 4: Update `AGENTS.md`

**Files:**
- Modify: `AGENTS.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Update the "External APIs" section**

Change:

```markdown
- **Supabase Storage** — user avatars and game images (remote patterns: `media.rawg.io`,
  `*.supabase.co/storage/v1/object/public/**`)
```

to:

```markdown
- **Cloudflare R2** — user avatars, via a presigned direct-to-R2 upload (`lib/r2.ts`,
  `createAvatarUploadUrl` in `app/user-actions.ts`). Game cover art is RAWG-hosted, never
  uploaded anywhere (remote patterns: `media.rawg.io`, plus the R2 custom domain in
  `R2_PUBLIC_URL`).
```

- [ ] **Step 2: Update the "Env Vars" section**

Add after the existing `STEAM_API_KEY` line:

```markdown
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
  (Cloudflare R2 — avatar uploads)
```

- [ ] **Step 3: Update the `lib/queries/user-auth.ts` bullet under "Supabase Clients & Drizzle"**

Change:

```markdown
- `lib/queries/user-auth.ts` — genuine Auth/Storage calls (`getViewer`, `signInWithPassword`, `uploadAvatarImage`, `signOut`, etc.)
```

to:

```markdown
- `lib/queries/user-auth.ts` — genuine Auth calls (`getViewer`, `signInWithPassword`, `signOut`, etc.) — avatar uploads moved to `lib/r2.ts` + `app/user-actions.ts`
```

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "Update AGENTS.md for the R2 avatar storage migration"
```
