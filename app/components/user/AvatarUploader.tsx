'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import { uploadAvatarImage } from '@/lib/queries/user'
import { saveAvatarUrl } from '@/app/user-actions'
import Avatar from '@/app/components/user/Avatar'

export default function AvatarUploader({ userId, currentAvatarUrl, username }: {
    userId: string
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

        const supabase = createClient()

        let publicUrl: string
        try {
            publicUrl = await uploadAvatarImage(supabase, userId, file)
        } catch (uploadError) {
            const message = uploadError instanceof Error ? uploadError.message : String(uploadError)
            setError('Upload failed: ' + message)
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