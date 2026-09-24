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

export function buildAvatarPublicUrl(publicBaseUrl: string, key: string, version?: string): string {
    const url = `${publicBaseUrl.replace(/\/+$/, '')}/${key}`
    return version ? `${url}?v=${version}` : url
}

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024

export function isValidAvatarSize(contentLength: number): boolean {
    return contentLength > 0 && contentLength <= MAX_AVATAR_BYTES
}
