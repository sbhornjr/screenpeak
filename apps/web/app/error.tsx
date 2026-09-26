'use client'

import { useEffect } from 'react'
import { logger } from '@/lib/logger'
import * as Sentry from '@sentry/nextjs'

export default function Error({
    error,
    unstable_retry,
}: {
    error: Error & { digest?: string }
    unstable_retry: () => void
}) {
    useEffect(() => {
        logger.error('render', 'Unhandled render error', {
            message: error.message,
            digest: error.digest,
        })
    }, [error])

    useEffect(() => {
        Sentry.captureException(error)
    }, [error])

    return (
        <main className="min-h-[60vh] flex items-center justify-center px-6">
            <div className="text-center max-w-md">
                <h1 className="text-2xl font-(family-name:--font-display) text-(--color-text) mb-2">
                    Something went wrong
                </h1>
                <p className="text-(--color-muted) mb-6">
                    {error.digest ? `Error reference: ${error.digest}` : 'An unexpected error occurred.'}
                </p>
                <button
                    onClick={() => unstable_retry()}
                    className="px-4 py-1.5 text-md bg-(--color-accent) text-(--color-bg) font-semibold rounded-[3px] hover:bg-(--color-accent-hover) transition-colors duration-200"
                >
                    Try again
                </button>
            </div>
        </main>
    )
}
