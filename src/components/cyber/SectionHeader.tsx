import type { ReactNode } from 'react'

interface SectionHeaderProps {
  title: string
  eyebrow?: string
  action?: ReactNode
}

export function SectionHeader({ title, eyebrow, action }: SectionHeaderProps) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="text-xs font-semibold uppercase text-cyan-soft">{eyebrow}</p> : null}
        <h2 className="text-lg font-semibold text-white">{title}</h2>
      </div>
      {action}
    </div>
  )
}
