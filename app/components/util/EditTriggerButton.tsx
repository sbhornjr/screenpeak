'use client'

import { Pencil } from "lucide-react"

export default function EditTriggerButton({ onClick, label = "Edit" }: { onClick: () => void, label?: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            className="inline-flex items-center gap-1 self-center text-xs font-medium
                text-(--color-muted) hover:text-(--color-accent)
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) rounded-[3px]
                transition-colors duration-200"
        >
            <Pencil size={12} aria-hidden />
            {label}
        </button>
    )
}
