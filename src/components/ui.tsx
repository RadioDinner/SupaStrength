/**
 * Shared dumb UI primitives (BUILD_PLAN 0.1 `components/`). No data access — pure
 * presentational pieces the feature screens compose.
 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { useId } from 'react'
import { Dumbbell } from 'lucide-react'
import { useDialog } from '../hooks/useDialog'

type ButtonVariant = 'primary' | 'ghost' | 'danger'

/** The app mark — a single inline SVG tinted with the brand accent (no emoji). */
export function Logo({ size = 28 }: { size?: number }) {
  return <Dumbbell size={size} strokeWidth={2.25} color="var(--accent)" aria-hidden="true" />
}

/** Brand header (mark + wordmark) reused by the auth/unconfigured screens. */
export function Brand() {
  return (
    <header className="brand">
      <Logo size={28} />
      <h1>SupaStrength</h1>
    </header>
  )
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={`btn btn--${variant} ${className}`} {...props} />
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <label className="field" htmlFor={htmlFor}>
      <span className="field__label">{label}</span>
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className="input" {...props}>
      {children}
    </select>
  )
}

export function Card({
  title,
  subtitle,
  children,
  actions,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  children?: ReactNode
  actions?: ReactNode
}) {
  return (
    <section className="card">
      {title ? (
        <div className="card__head">
          <div>
            <h2 className="card__title">{title}</h2>
            {subtitle ? <p className="card__sub">{subtitle}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <span className="spinner__dot" aria-hidden="true" />
      {label ? <span>{label}</span> : null}
    </div>
  )
}

export function Skeleton({ w, h = 14, radius = 0 }: { w?: number | string; h?: number; radius?: number }) {
  return (
    <span
      className="skeleton"
      style={{ width: w ?? '100%', height: h, borderRadius: radius }}
      aria-hidden="true"
    />
  )
}

/** A few skeleton card rows for list-loading states (product register: skeletons > spinners). */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="page" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div className="card" key={i}>
          <Skeleton w="55%" h={16} />
          <div style={{ height: 10 }} />
          <Skeleton w="35%" h={12} />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden="true">
        {icon}
      </div>
      <p className="empty__title">{title}</p>
      {hint ? <p className="empty__hint">{hint}</p> : null}
      {action ? <div className="empty__action">{action}</div> : null}
    </div>
  )
}

export function Banner({ kind, children }: { kind: 'ok' | 'warn' | 'err' | 'info'; children: ReactNode }) {
  const live =
    kind === 'err'
      ? { role: 'alert' as const }
      : { role: 'status' as const, 'aria-live': 'polite' as const }
  return (
    <div className={`status status--${kind === 'info' ? 'wait' : kind}`} {...live}>
      {children}
    </div>
  )
}

/**
 * Accessible confirm dialog (bottom-sheet). Focus-trapped + Escape-to-close via
 * useDialog. Use to gate destructive/irreversible actions.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Confirm',
  danger = false,
  pending = false,
  onConfirm,
  onCancel,
}: {
  title: string
  body?: ReactNode
  confirmLabel?: string
  danger?: boolean
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const panelRef = useDialog<HTMLDivElement>(onCancel)
  const titleId = useId()
  return (
    <div className="sheet">
      <div className="sheet__backdrop" onClick={onCancel} />
      <div
        className="sheet__panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h3 className="sheet__title" id={titleId}>
          {title}
        </h3>
        {body ? <p className="sheet__summary">{body}</p> : null}
        <div className="sheet__actions">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={pending}>
            {pending ? '…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
