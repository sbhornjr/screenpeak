'use client'

import { ReactNode, useEffect, useId, useRef } from "react"

type ModalProps = {
    onClose: () => void
    title?: ReactNode
    titleClassName?: string
    panelClassName?: string
    children: ReactNode
}

const FOCUSABLE =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Modal({
    onClose,
    title,
    titleClassName = "font-semibold text-3xl mb-6 self-center",
    panelClassName = "w-full max-w-md p-8",
    children,
}: ModalProps) {
    const panelRef = useRef<HTMLDivElement>(null)
    const titleId = useId()

    // Latest-ref so the mount effect can stay `[]` without going stale on the
    // inline `onClose` most callers pass.
    const onCloseRef = useRef(onClose)
    useEffect(() => {
        onCloseRef.current = onClose
    })

    useEffect(() => {
        const panel = panelRef.current
        const previouslyFocused = document.activeElement as HTMLElement | null

        // Move focus into the dialog — the first form field if there is one,
        // otherwise the panel itself so screen readers announce the dialog.
        // preventScroll: the panel is a scroll container, and the default
        // focus-into-view behaviour nudges its scrollTop off zero, which hides
        // the top padding above the close button on tall (scrolling) modals.
        const firstField = panel?.querySelector<HTMLElement>(
            'input:not([disabled]), textarea:not([disabled]), select:not([disabled])',
        )
        ;(firstField ?? panel)?.focus({ preventScroll: true })

        // Lock body scroll, compensating for the vanishing scrollbar so the
        // page behind doesn't shift. Nested modals no-op cleanly: the inner one
        // sees width 0 (scrollbar already gone) and restores the outer's values.
        const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth
        const prevOverflow = document.body.style.overflow
        const prevPaddingRight = document.body.style.paddingRight
        document.body.style.overflow = "hidden"
        if (scrollBarWidth > 0) document.body.style.paddingRight = `${scrollBarWidth}px`

        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") {
                e.preventDefault()
                onCloseRef.current()
                return
            }
            if (e.key !== "Tab" || !panel) return

            // Only this modal's own focusables — not a nested modal's.
            const focusables = Array.from(
                panel.querySelectorAll<HTMLElement>(FOCUSABLE),
            ).filter((el) => el.closest('[role="dialog"]') === panel)

            if (focusables.length === 0) {
                e.preventDefault()
                panel.focus()
                return
            }

            const first = focusables[0]
            const last = focusables[focusables.length - 1]
            const active = document.activeElement

            if (e.shiftKey && (active === first || active === panel)) {
                e.preventDefault()
                last.focus()
            } else if (!e.shiftKey && active === last) {
                e.preventDefault()
                first.focus()
            }
        }

        document.addEventListener("keydown", onKeyDown)

        return () => {
            document.removeEventListener("keydown", onKeyDown)
            document.body.style.overflow = prevOverflow
            document.body.style.paddingRight = prevPaddingRight
            previouslyFocused?.focus()
        }
    }, [])

    // Close on backdrop click — but only when the press *started* on the
    // backdrop, so dragging a text selection out of the panel and releasing
    // doesn't dismiss it.
    const pressStartedOnBackdrop = useRef(false)

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm w-full h-full flex items-start sm:items-center justify-center z-50 p-4 sm:p-5 overflow-y-auto"
            onMouseDown={(e) => {
                pressStartedOnBackdrop.current = e.target === e.currentTarget
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget && pressStartedOnBackdrop.current) onClose()
            }}
        >
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? titleId : undefined}
                tabIndex={-1}
                className={`bg-(--color-surface) border border-(--color-border) rounded-[3px] relative flex flex-col my-auto max-h-[calc(100dvh-2rem)] overflow-hidden focus:outline-none ${panelClassName}`}
            >
                {/* Fixed header — the close button + title never scroll, so the
                    body can scroll under them without jamming against the top. */}
                <div className="shrink-0 flex flex-col">
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="mb-2 self-end grid place-items-center size-8 rounded-full text-(--color-muted) border border-(--color-border) bg-(--color-surface-light) hover:text-(--color-text) hover:border-(--color-muted) transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)"
                    >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                            <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                        </svg>
                    </button>
                    {title && (
                        <h2 id={titleId} className={titleClassName}>
                            {title}
                        </h2>
                    )}
                </div>
                <div className="grow min-h-0 overflow-y-auto flex flex-col">
                    {children}
                </div>
            </div>
        </div>
    )
}
