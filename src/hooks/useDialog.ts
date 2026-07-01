/**
 * Modal-dialog a11y: initial focus, focus trap, Escape-to-close, focus restore,
 * and a background scroll lock. Attach the returned ref to the dialog panel
 * (the element carrying role="dialog" aria-modal="true"). Used by every
 * bottom-sheet so modal keyboard/SR behavior lives in one place.
 */
import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), video[controls], audio[controls], [tabindex]:not([tabindex="-1"])'

export function useDialog<T extends HTMLElement>(onClose: () => void) {
  const panelRef = useRef<T>(null)
  // Always call the latest onClose without re-running the effect.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const panel = panelRef.current
    const prevFocus = document.activeElement as HTMLElement | null

    // Focus the panel itself so screen readers announce the dialog's name/role
    // before its controls; Tab then moves into the content.
    panel?.focus()

    const bodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const visible = (el: HTMLElement) =>
      el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
    const focusables = () =>
      panel ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible) : []

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Let the browser handle Escape when it's exiting native video fullscreen.
        if (document.fullscreenElement) return
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const f = focusables()
      const first = f[0]
      const last = f[f.length - 1]
      if (!first || !last) {
        e.preventDefault()
        panel.focus()
        return
      }
      const active = document.activeElement as HTMLElement | null
      // Recapture focus that escaped the panel — e.g. the focused control was
      // disabled mid-action (pending state), dropping focus to <body>.
      if (!active || !panel.contains(active)) {
        e.preventDefault()
        first.focus()
        return
      }
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = bodyOverflow
      prevFocus?.focus?.()
    }
  }, [])

  return panelRef
}
