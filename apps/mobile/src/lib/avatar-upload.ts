import type { AvatarUploadRequest, AvatarUploadResult } from '@screenpeak/shared/api/writes'
import { AVATAR_MAX_BYTES } from '@screenpeak/shared/constants'

import { actionFailure } from './failure'

/** Avatars are shrunk to this many pixels on a side, as a JPEG, before upload. */
export const AVATAR_PIXELS = 512
const CONTENT_TYPE = 'image/jpeg'

/** Each step of a photo change. The native ones live in `avatar-picker.ts`. */
export type AvatarSteps = {
  /** Null when the picker was closed without a photo. */
  pick: () => Promise<{ uri: string } | null>
  /** A square JPEG of the pick, `AVATAR_PIXELS` wide. */
  shrink: (uri: string) => Promise<string>
  read: (uri: string) => Promise<Blob>
  presign: (body: AvatarUploadRequest) => Promise<AvatarUploadResult>
  /** The direct PUT to storage. False when storage refused it. */
  put: (url: string, body: Blob, contentType: string) => Promise<boolean>
  save: (url: string) => Promise<unknown>
}

export type AvatarOutcome =
  | { kind: 'canceled' }
  | { kind: 'saved', url: string }
  | { kind: 'failed', message: string }

/** The website's AvatarUploader, in order: upload URL, direct PUT, then save the public URL. */
export async function changeAvatar(steps: AvatarSteps): Promise<AvatarOutcome> {
  const picked = await steps.pick()
  if (!picked) return { kind: 'canceled' }

  let image: Blob
  try {
    image = await steps.read(await steps.shrink(picked.uri))
  } catch {
    return { kind: 'failed', message: "Couldn't read that photo. Try another one." }
  }
  if (image.size > AVATAR_MAX_BYTES) return { kind: 'failed', message: 'Image must be under 2MB' }

  try {
    const { uploadUrl, publicUrl } = await steps.presign({ contentType: CONTENT_TYPE, contentLength: image.size })
    if (!(await steps.put(uploadUrl, image, CONTENT_TYPE))) {
      return { kind: 'failed', message: "Couldn't upload the photo. Try again." }
    }
    await steps.save(publicUrl)
    return { kind: 'saved', url: publicUrl }
  } catch (error) {
    return { kind: 'failed', message: actionFailure(error) }
  }
}
