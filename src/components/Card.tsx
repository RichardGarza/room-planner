import type { ReactNode } from 'react'
import { cardOpen, useCards } from './Collapse'

interface CardProps {
  /** key the open/closed state is remembered under */
  id: string
  title: ReactNode
  /** something small for the right side of the header, e.g. a unit hint or a count */
  extra?: ReactNode
  defaultOpen?: boolean
  className?: string
  children: ReactNode
}

/**
 * A sidebar card whose header row (title, optional extra, chevron) opens and closes its body.
 * The state is kept per id in localStorage, so the panel comes back the way it was left.
 */
export function Card({ id, title, extra, defaultOpen = true, className = '', children }: CardProps) {
  const open = useCards((s) => cardOpen(s.open, id, defaultOpen))
  const toggle = useCards((s) => s.toggle)
  return (
    <section className={`card${open ? '' : ' closed'}${className ? ` ${className}` : ''}`} data-card={id}>
      <button type="button" className="card-toggle" aria-expanded={open} onClick={() => toggle(id, defaultOpen)}>
        <h4>{title}</h4>
        {extra != null && <span className="card-extra muted small">{extra}</span>}
        <span className="chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="card-body">{children}</div>}
    </section>
  )
}

interface SectionProps {
  id: string
  title: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}

/** A collapsible sub-section inside a card (the Windows / Doors / … groups of the Room card). */
export function Section({ id, title, defaultOpen = true, children }: SectionProps) {
  const open = useCards((s) => cardOpen(s.open, id, defaultOpen))
  const toggle = useCards((s) => s.toggle)
  return (
    <div className={`subsection${open ? '' : ' closed'}`} data-section={id}>
      <button type="button" className="section-toggle" aria-expanded={open} onClick={() => toggle(id, defaultOpen)}>
        <h5>{title}</h5>
        <span className="chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  )
}
