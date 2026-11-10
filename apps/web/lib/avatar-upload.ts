import { AVATAR_MAX_BYTES } from '@screenpeak/shared/constants'

const ALLOWED_AVATAR_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export function getAvatarKeyForUpload(userId: string, contentType: string): string | null {
    if (!ALLOWED_AVATAR_CONTENT_TYPES.has(contentType)) return null
    return `${userId}/avatar`
}

export function buildAvatarPublicUrl(publicBaseUrl: string, key: string, version?: string): string {
    const url = `${publicBaseUrl.replace(/\/+$/, '')}/${key}`
    return version ? `${url}?v=${version}` : url
}

export const MAX_AVATAR_BYTES = AVATAR_MAX_BYTES

export function avatarUploadErrorMessage(error: 'unsupported_type' | 'too_large'): string {
    return error === 'too_large' ? 'Image must be under 2MB' : 'Unsupported image type'
}

/**
 * The public URL the presigner returns. The host must be this deployment's
 * R2 origin, the path must be exactly `/${userId}/avatar`, and the only
 * allowed query is an empty or all-digit `v`. A path suffix on another host
 * is not this user's object.
 */
export function isOwnAvatarUrl(url: string, userId: string, publicBaseUrl = process.env.R2_PUBLIC_URL): boolean {
    if (!publicBaseUrl) return false
    try {
        const base = new URL(publicBaseUrl)
        const parsed = new URL(url)
        if (parsed.origin !== base.origin) return false
        if (parsed.pathname !== `/${userId}/avatar`) return false
        const keys = [...parsed.searchParams.keys()]
        if (keys.length === 0) return true
        if (keys.length !== 1 || keys[0] !== 'v') return false
        const version = parsed.searchParams.get('v') ?? ''
        return version === '' || /^[0-9]+$/.test(version)
    } catch {
        return false
    }
}

export function isValidAvatarSize(contentLength: number): boolean {
    return contentLength > 0 && contentLength <= MAX_AVATAR_BYTES
}
