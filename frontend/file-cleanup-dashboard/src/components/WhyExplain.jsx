import { useState, useRef, useEffect } from 'react'
import { HelpCircle, X } from 'lucide-react'

function explainFile(file) {
  const score = Number(file.importance_score) || 0
  const label = file.label || 'REVIEW'

  const structuredTop3 = [
    { signal: 'top_signal_1', label: file.top_signal_1, value: file.top_signal_1_value },
    { signal: 'top_signal_2', label: file.top_signal_2, value: file.top_signal_2_value },
    { signal: 'top_signal_3', label: file.top_signal_3, value: file.top_signal_3_value },
  ].filter(s => s.label && s.value != null)

  let entries
  if (structuredTop3.length > 0) {
    entries = structuredTop3
  } else {
    const signals = file.signals || {}
    entries = Object.entries(signals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([key, value]) => ({
        signal: key,
        label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        value: Math.min(1, value),
      }))
  }

  const hasRealExplanation = Boolean(file.explanation_text)
  const text = hasRealExplanation
    ? file.explanation_text
    : `This file is labeled ${label} with an importance score of ${score}. The strongest signals are ${entries.map(e => e.label).join(', ')}.`
  const tip = file.counterfactual_tip
    || `Use this explanation to decide whether the file should be kept, archived, or reviewed.`

  const hasRealConfidence = file.confidence != null
  const confidence = hasRealConfidence
    ? Number(file.confidence)
    : Math.min(1, Math.max(0.05, score / 100))

  return {
    text,
    top3: entries,
    tip,
    confidence,
    hasRealConfidence,
  }
}

export default function WhyExplain({ file, align = 'left' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const ex = explainFile(file)

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        className="focus-ring inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-900/30"
        aria-label="Why this score?"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        Why?
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`animate-fadein absolute z-30 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-card dark:border-slate-700 dark:bg-navy-900 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Why this recommendation?</p>
            <button onClick={() => setOpen(false)} className="focus-ring rounded-md p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{ex.text}</p>

          {ex.top3.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {ex.top3.map(s => (
                <div key={s.signal} className="flex items-center gap-2">
                  <span className="w-36 shrink-0 truncate text-xs text-slate-500 dark:text-slate-400">{s.label}</span>
                  <div className="h-1.5 flex-1 rounded-full bg-slate-100 dark:bg-slate-700">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.round(s.value * 100)}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">{Math.round(s.value * 100)}%</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 rounded-xl bg-brand-50 px-3 py-2 text-xs text-brand-800 dark:bg-brand-900/30 dark:text-brand-300">
            <span className="font-semibold">Tip — </span>{ex.tip}
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
            <span>{ex.hasRealConfidence ? `Confidence ${Math.round(ex.confidence * 100)}%` : `Estimated confidence ${Math.round(ex.confidence * 100)}%`}</span>
            <span>You always make the final call.</span>
          </div>
        </div>
      )}
    </div>
  )
}
