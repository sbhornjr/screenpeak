// Server-only: constructs an S3Client via the @aws-sdk packages, which pull in
// Node built-ins. Never import this from a 'use client' file — same bundle-
// separation constraint lib/db.ts documents for the Drizzle/postgres client.
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getAvatarKeyForUpload, buildAvatarPublicUrl } from '@/lib/avatar-upload'

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
