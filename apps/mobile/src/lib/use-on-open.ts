import { useEffect, useEffectEvent, useRef } from 'react'

/** Run `reset` each time a sheet opens, not while it stays open. */
export function useOnOpen(visible: boolean, reset: () => void) {
  const open = useRef(false)
  const onOpen = useEffectEvent(reset)
  useEffect(() => {
    if (visible && !open.current) onOpen()
    open.current = visible
  }, [visible])
}
