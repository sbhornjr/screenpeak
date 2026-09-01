"use client"

import { ChangeEvent } from 'react';

const selectClass = `
    bg-(--color-surface) text-(--color-text) text-sm
    border border-(--color-border) rounded-[3px]
    px-3 py-2 pr-8 min-h-11
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:border-(--color-accent)
    hover:border-(--color-accent)/50
    transition-colors duration-200 cursor-pointer appearance-none
    w-full
`

const arrowClass = "absolute right-2.5 top-1/2 -translate-y-1/2 text-(--color-muted) text-xs pointer-events-none"

export default function FilterSelect({ value, onChange, children, width } : {
    value: string, onChange: (e: ChangeEvent<HTMLSelectElement>) => void, children: React.ReactNode, width?: string
}) {
    return (
        <div className={`relative shrink-0 ${width ?? 'w-44'}`}>
            <select
                value={value}
                onChange={onChange}
                className={selectClass}
            >
                {children}
            </select>
            <span className={arrowClass}>▾</span>
        </div>
    )
}