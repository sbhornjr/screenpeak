'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createAvatarUploadUrl, saveAvatarUrl } from '@/app/user-actions'
import Avatar from '@/app/components/user/Avatar'
import { MAX_AVATAR_BYTES } from '@/lib/avatar-upload'

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
        if (file.size > MAX_AVATAR_BYTES) {
            setError('Image must be under 2MB')
            return
        }

        setError('')
        setUploading(true)

        try {
            const result = await createAvatarUploadUrl(file.type, file.size)
            if ('error' in result) {
                setError(result.error)
                return
            }

            const putResponse = await fetch(result.uploadUrl, {
                method: 'PUT',
                body: file,
                headers: { 'Content-Type': file.type },
            })

            if (!putResponse.ok) {
                setError('Upload failed: could not reach storage')
                return
            }

            // Update user's avatar_url in the database
            const updateError = await saveAvatarUrl(result.publicUrl)

            if (updateError) {
                setError('Failed to save avatar')
                return
            }

            setPreview(result.publicUrl)
            router.refresh()
        } catch (uploadError) {
            const message = uploadError instanceof Error ? uploadError.message : String(uploadError)
            setError('Upload failed: ' + message)
        } finally {
            setUploading(false)
        }
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
