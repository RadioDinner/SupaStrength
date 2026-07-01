/**
 * Lightweight toast notifications. `useToast().toast(message, kind)` from
 * anywhere under <ToastProvider>. Used to surface mutation failures (e.g. a
 * set-log that didn't persist on spotty gym signal) instead of failing silently.
 */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

type ToastKind = 'ok' | 'err' | 'info'
type Toast = { id: number; message: string; kind: ToastKind }

const ToastCtx = createContext<(message: string, kind?: ToastKind) => void>(() => {})

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  return { toast: useContext(ToastCtx) }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = (idRef.current += 1)
      setToasts((cur) => [...cur, { id, message, kind }])
      setTimeout(() => dismiss(id), 4500)
    },
    [dismiss],
  )

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toasts" aria-live="polite" aria-label="Notifications">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`} role={t.kind === 'err' ? 'alert' : 'status'}>
            <span className="toast__msg">{t.message}</span>
            <button className="toast__x" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
