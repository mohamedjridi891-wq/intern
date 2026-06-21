import { STATUS_META } from '../lib/api'

export default function StatusBadge({ label, size = 'sm' }) {
  const meta = STATUS_META[label] || STATUS_META.REVIEW
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClass} ${meta.badgeClass}`}>
      {meta.label}
    </span>
  )
}
