export function KpiCard({ icon: Icon, label, value, sub, tone = 'default' }) {
  const toneClass = {
    default: 'bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400',
    good: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    warn: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  }[tone]

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-navy-900">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        {Icon && (
          <span className={`flex h-8 w-8 items-center justify-center rounded-full ${toneClass}`}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-50">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-16 text-center dark:border-slate-700 dark:bg-navy-900/40">
      {Icon && (
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
          <Icon className="h-6 w-6" />
        </span>
      )}
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function SkeletonRows({ rows = 5, cols = 5 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 rounded-xl border border-slate-100 p-3 dark:border-slate-800">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="h-4 flex-1 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SectionCard({ title, action, children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-navy-900 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}
