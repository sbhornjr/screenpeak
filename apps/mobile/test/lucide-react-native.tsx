import React from 'react'

function Icon({ accessibilityLabel }: { accessibilityLabel?: string }) {
  return React.createElement('span', { role: 'img', 'aria-label': accessibilityLabel })
}

export const Clock = Icon
export const Repeat = Icon
export const Trophy = Icon
