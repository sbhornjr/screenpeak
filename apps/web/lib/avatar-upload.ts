const ALLOWED_AVATAR_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export function getAvatarKeyForUpload(userId: string, contentType: string): string | null {
    if (!ALLOWED_AVATAR_CONTENT_TYPES.has(contentType)) return null
    return `${userId}/avatar`
}

export function buildAvatarPublicUrl(publicBaseUrl: string, key: string, version?: string): string {
    const url = `${publicBaseUrl.replace(/\/+$/, '')}/${key}`
    return version ? `${url}?v=${version}` : url
}

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024

export function avatarUploadErrorMessage(error: 'unsupported_type' | 'too_large'): string {
    return error === 'too_large' ? 'Image must be under 2MB' : 'Unsupported image type'
}

/** The public URL the presigner returns. Rejects a URL that is not this user's object. */
export function isOwnAvatarUrl(url: string, userId: string): boolean {
    try {
        const parsed = new URL(url)
        return parsed.pathname.endsWith(`/${userId}/avatar`)
    } catch {
        return false
    }
}

export function isValidAvatarSize(contentLength: number): boolean {
    return contentLength > 0 && contentLength <= MAX_AVATAR_BYTES
}
