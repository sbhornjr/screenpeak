import React from 'react'

function Icon({ accessibilityLabel }: { accessibilityLabel?: string }) {
  return React.createElement('span', { role: 'img', 'aria-label': accessibilityLabel })
}

export const ArrowDownWideNarrow = Icon
export const ArrowUpNarrowWide = Icon
export const ChevronDown = Icon
export const Clock = Icon
export const Crosshair = Icon
export const Heart = Icon
export const Library = Icon
export const List = Icon
export const Pencil = Icon
export const Pin = Icon
export const Plus = Icon
export const Repeat = Icon
export const SlidersHorizontal = Icon
export const Trophy = Icon
export const X = Icon
