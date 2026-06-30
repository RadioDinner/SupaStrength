/**
 * Shared dumb UI primitives (BUILD_PLAN 0.1 `components/`). No data access — pure
 * presentational pieces the feature screens compose.
 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'ghost' | 'danger'

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

export function Skeleton({ w, h = 14, radius = 6 }: { w?: number | string; h?: number; radius?: number }) {
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
  return <div className={`status status--${kind === 'info' ? 'wait' : kind}`}>{children}</div>
}
