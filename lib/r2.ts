// Server-only: constructs an S3Client via the @aws-sdk packages, which pull in
// Node built-ins. Never import this from a 'use client' file — same bundle-
// separation constraint lib/db.ts documents for the Drizzle/postgres client.
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getAvatarKeyForUpload, buildAvatarPublicUrl, isValidAvatarSize } from '@/lib/avatar-upload'

function requireEnv(name: string): string {
    const value = process.env[name]
    if (!value) throw new Error(`${name} is not set`)
    return value
}

const accountId = requireEnv('R2_ACCOUNT_ID')
const accessKeyId = requireEnv('R2_ACCESS_KEY_ID')
const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY')
const bucketName = requireEnv('R2_BUCKET_NAME')
const r2PublicUrl = requireEnv('R2_PUBLIC_URL')

const s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
})

const AVATAR_UPLOAD_TTL_SECONDS = 300

export async function createPresignedAvatarUploadUrl(
    userId: string,
    contentType: string,
    contentLength: number,
): Promise<{ uploadUrl: string; publicUrl: string } | { error: 'unsupported_type' | 'too_large' }> {
    const target = getAvatarKeyForUpload(userId, contentType)
    if (!target) return { error: 'unsupported_type' }
    if (!isValidAvatarSize(contentLength)) return { error: 'too_large' }

    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: target.key,
        ContentType: contentType,
        ContentLength: contentLength,
    })

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: AVATAR_UPLOAD_TTL_SECONDS })

    // The object key is stable per user+content-type (overwrite in place, no
    // orphaned objects), so the URL needs its own cache-busting token or a
    // re-upload of the same content-type is indistinguishable, to a browser
    // or the Next.js image optimizer, from a cache hit on the old bytes.
    const version = Date.now().toString()

    return { uploadUrl, publicUrl: buildAvatarPublicUrl(r2PublicUrl, target.key, version) }
}
