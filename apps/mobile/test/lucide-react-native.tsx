import React from 'react'

function Icon({ accessibilityLabel }: { accessibilityLabel?: string }) {
  return React.createElement('span', { role: 'img', 'aria-label': accessibilityLabel })
}

export const Clock = Icon
export const Crosshair = Icon
export const Library = Icon
export const List = Icon
export const Pencil = Icon
export const Repeat = Icon
export const Trophy = Icon
