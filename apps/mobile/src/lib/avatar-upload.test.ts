import { ApiClientError } from '@screenpeak/shared/api/client'
import { describe, expect, it, vi } from 'vitest'

import { changeAvatar, type AvatarSteps } from './avatar-upload'

const PUBLIC_URL = 'https://cdn.example/u1/avatar?v=1'

function steps(overrides: Partial<AvatarSteps> = {}) {
  const base: AvatarSteps = {
    pick: vi.fn(async () => ({ uri: 'file:///picked.heic' })),
    shrink: vi.fn(async () => 'file:///avatar.jpg'),
    read: vi.fn(async () => new Blob([new Uint8Array(40_000)], { type: 'image/jpeg' })),
    presign: vi.fn(async () => ({ uploadUrl: 'https://upload.example/put', publicUrl: PUBLIC_URL })),
    put: vi.fn(async () => true),
    save: vi.fn(async () => undefined),
  }
  return { ...base, ...overrides }
}

describe('changeAvatar', () => {
  it('shrinks the pick to a JPEG, uploads it, and saves the public URL', async () => {
    const s = steps()
    expect(await changeAvatar(s)).toEqual({ kind: 'saved', url: PUBLIC_URL })
    expect(s.shrink).toHaveBeenCalledWith('file:///picked.heic')
    expect(s.read).toHaveBeenCalledWith('file:///avatar.jpg')
    expect(s.presign).toHaveBeenCalledWith({ contentType: 'image/jpeg', contentLength: 40_000 })
    expect(s.put).toHaveBeenCalledWith('https://upload.example/put', expect.any(Blob), 'image/jpeg')
    expect(s.save).toHaveBeenCalledWith(PUBLIC_URL)
  })

  it('does nothing when the picker is closed', async () => {
    const s = steps({ pick: vi.fn(async () => null) })
    expect(await changeAvatar(s)).toEqual({ kind: 'canceled' })
    expect(s.presign).not.toHaveBeenCalled()
  })

  it('refuses an image still over 2MB before asking for an upload URL', async () => {
    const s = steps({ read: vi.fn(async () => new Blob([new Uint8Array(2 * 1024 * 1024 + 1)])) })
    expect(await changeAvatar(s)).toEqual({ kind: 'failed', message: 'Image must be under 2MB' })
    expect(s.presign).not.toHaveBeenCalled()
  })

  it('names the wait when the upload URL is rate limited', async () => {
    const s = steps({
      presign: vi.fn(async () => {
        throw new ApiClientError(429, 'rate_limited', 'Too many requests.', 12)
      }),
    })
    expect(await changeAvatar(s)).toEqual({ kind: 'failed', message: 'Too many requests. Try again in 12 seconds.' })
  })

  it('does not save the URL when storage refuses the upload', async () => {
    const s = steps({ put: vi.fn(async () => false) })
    expect(await changeAvatar(s)).toEqual({ kind: 'failed', message: "Couldn't upload the photo. Try again." })
    expect(s.save).not.toHaveBeenCalled()
  })

  it('says the photo could not be read when shrinking fails', async () => {
    const s = steps({ shrink: vi.fn(async () => { throw new Error('decode failed') }) })
    expect(await changeAvatar(s)).toEqual({ kind: 'failed', message: "Couldn't read that photo. Try another one." })
  })
})
