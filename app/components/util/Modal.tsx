'use client'

import { ReactNode } from "react"

type ModalProps = {
    onClose: () => void
    title?: ReactNode
    titleClassName?: string
    panelClassName?: string
    children: ReactNode
}

export default function Modal({
    onClose,
    title,
    titleClassName = "font-semibold text-3xl mb-6 self-center",
    panelClassName = "w-full max-w-md p-6 sm:p-8",
    children,
}: ModalProps) {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm w-full h-full flex items-start sm:items-center justify-center z-50 p-4 sm:p-5 overflow-y-auto">
            <div className={`bg-(--color-surface) border border-(--color-border) rounded-[3px] relative flex flex-col my-auto max-h-[calc(100dvh-2rem)] overflow-y-auto ${panelClassName}`}>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="mb-4 self-end grid place-items-center size-8 rounded-full text-(--color-muted) border border-(--color-border) bg-(--color-surface-light) hover:text-(--color-text) hover:border-(--color-muted) transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)"
                >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                    </svg>
                </button>
                {title && <h2 className={titleClassName}>{title}</h2>}
                {children}
            </div>
        </div>
    )
}
