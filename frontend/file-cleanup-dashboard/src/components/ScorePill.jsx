function colorFor(score) {
  if (score >= 80) return { bar: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' }
  if (score >= 50) return { bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400' }
  if (score >= 20) return { bar: 'bg-yellow-500', text: 'text-yellow-700 dark:text-yellow-300' }
  return { bar: 'bg-red-500', text: 'text-red-700 dark:text-red-400' }
}

export default function ScorePill({ score, width = 64 }) {
  const c = colorFor(score)
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden" style={{ width }}>
        <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${c.text}`}>{score}</span>
    </div>
  )
}
