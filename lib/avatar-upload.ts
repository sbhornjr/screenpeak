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

export function isValidAvatarSize(contentLength: number): boolean {
    return contentLength > 0 && contentLength <= MAX_AVATAR_BYTES
}
