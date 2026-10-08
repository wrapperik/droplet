import { useEffect, type RefObject } from 'react'

// A popover drawn on the page above another one (such as a chat's menu inside the list of all chats) carries this attribute, so a press or
// Escape inside it belongs to it and does not close the one beneath.
export const LAYER_ATTRIBUTE = 'data-layer'

const inOtherLayer = (target: EventTarget | null, own: HTMLElement | null) => {
  const layer = target instanceof Element ? target.closest(`[${LAYER_ATTRIBUTE}]`) : null
  return layer !== null && layer !== own && !own?.contains(layer)
}

// Closes a popover on Escape or on a pointer press outside the given element.
export function useDismiss(open: boolean, onClose: () => void, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node) && !inOtherLayer(event.target, ref.current)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !inOtherLayer(event.target, ref.current)) onClose()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose, ref])
}
