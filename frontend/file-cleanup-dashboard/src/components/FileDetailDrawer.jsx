import { X, Copy, FileSearch, ShieldCheck } from 'lucide-react'
import FileIcon from './FileIcon'
import StatusBadge from './StatusBadge'
import { formatSize, formatDate } from '../lib/format'

function explainFile(file) {
  const score = Number(file.importance_score) || 0
  const signals = file.signals || {}
  const top3 = Object.entries(signals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, value]) => ({
      label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      value,
    }))

  const text = `This file has a score of ${score} and is marked ${file.label || 'REVIEW'}. The most influential signals are ${top3.map(item => item.label).join(', ')}.`
  return {
    text,
    top3,
    tip: 'Review the top signals above to understand why this file was highlighted.',
    confidence: Math.min(1, Math.max(0.05, score / 100)),
  }
}

export default function FileDetailDrawer({ file, onClose, onAction }) {
  if (!file) return null
  const ex = explainFile(file)

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/30 animate-fadein" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto bg-white shadow-2xl animate-fadein dark:bg-navy-900">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5 dark:border-slate-800">
          <div className="flex items-start gap-3 min-w-0">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
              <FileIcon icon={file.icon} className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-slate-900 dark:text-slate-50">{file.name}</h2>
              <p className="truncate font-mono text-xs text-slate-400">{file.path}</p>
            </div>
          </div>
          <button onClick={onClose} className="focus-ring shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="flex items-center gap-2">
            <StatusBadge label={file.label} size="md" />
            {file.is_duplicate && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Copy className="h-3 w-3" /> Duplicate match
              </span>
            )}
          </div>

          <section className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-navy-950/60">
            <Meta label="Size" value={formatSize(file.size_mb)} />
            <Meta label="Type" value={file.category} />
            <Meta label="Modified" value={formatDate(file.modified_time)} />
            <Meta label="Created" value={formatDate(file.created_time)} />
            <Meta label="Extraction" value={file.extraction_status} />
            <Meta label="Importance" value={`${file.importance_score} / 100`} />
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Extracted content preview</h3>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs leading-relaxed text-slate-500 dark:border-slate-800 dark:bg-navy-950/60 dark:text-slate-400">
              <FileSearch className="mb-1.5 h-4 w-4 text-slate-400" />
              {file.extraction_status === 'FAILED'
                ? 'This file could not be read automatically — it has been set aside for manual review.'
                : `"…${file.name.replace(/_/g, ' ').replace(/\.\w+$/, '')} — preview generated from the file's extracted text. Full content available once you open the file directly."`}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Why this score?</h3>
              <span className="text-xs text-slate-400">Confidence {Math.round(ex.confidence * 100)}%</span>
            </div>
            <p className="mb-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{ex.text}</p>
            {ex.top3.length > 0 && (
              <div className="space-y-2">
                {ex.top3.map(item => (
                  <div key={item.label} className="flex items-center gap-2">
                    <span className="w-40 shrink-0 truncate text-xs text-slate-500 dark:text-slate-400">{item.label}</span>
                    <div className="h-1.5 flex-1 rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.round(item.value * 100)}%` }} />
                    </div>
                    <span className="w-8 shrink-0 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {Math.round(item.value * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-2 text-xs text-brand-800 dark:bg-brand-900/30 dark:text-brand-300">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span><span className="font-semibold">Tip — </span>{ex.tip}</span>
            </div>
          </section>
        </div>

        <div className="sticky bottom-0 flex gap-2 border-t border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-navy-900">
          <ActionButton tone="keep" label="Keep" onClick={() => onAction?.('KEEP', file)} />
          <ActionButton tone="archive" label="Archive" onClick={() => onAction?.('ARCHIVE', file)} />
          <ActionButton tone="delete" label="Delete" onClick={() => onAction?.('DELETE', file)} />
          <ActionButton tone="review" label="Mark reviewed" onClick={() => onAction?.('REVIEWED', file)} />
        </div>
      </aside>
    </>
  )
}

function Meta({ label, value }) {
  return (
    <div>
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="font-medium text-slate-700 dark:text-slate-200">{value}</p>
    </div>
  )
}

function ActionButton({ tone, label, onClick }) {
  const toneClass = {
    keep: 'bg-emerald-600 hover:bg-emerald-700',
    archive: 'bg-amber-600 hover:bg-amber-700',
    delete: 'bg-red-600 hover:bg-red-700',
    review: 'bg-slate-600 hover:bg-slate-700',
  }[tone]
  return (
    <button onClick={onClick} className={`focus-ring flex-1 rounded-xl px-2.5 py-2 text-xs font-semibold text-white ${toneClass}`}>
      {label}
    </button>
  )
}
