import { useEffect, useState } from 'react'
import { Check, X, SkipForward, PartyPopper } from 'lucide-react'
import FileIcon from '../components/FileIcon'
import StatusBadge from '../components/StatusBadge'
import WhyExplain from '../components/WhyExplain'
import { EmptyState, SectionCard } from '../components/Shared'
import { formatSize, formatDate, timeAgo } from '../lib/format'
import { fetchReviewQueue, performFileAction } from '../lib/api'

export default function ReviewQueue() {
  const [queue, setQueue] = useState([])
  const [index, setIndex] = useState(0)
  const [decided, setDecided] = useState(0)
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(true)

  // Load review queue on mount
  useEffect(() => {
    async function load() {
      try {
        const data = await fetchReviewQueue(500)
        setQueue(data || [])
      } catch (err) {
        console.error('Failed to load review queue:', err)
        setQueue([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const current = queue[index]

  // Map the swipe verbs to the backend's accepted actions
  // (the /files/{id}/action endpoint only accepts KEEP/ARCHIVE/DELETE/REVIEWED).
  const ACTION_MAP = { Approved: 'KEEP', Rejected: 'DELETE', Skipped: 'REVIEWED' }

  async function decide(action) {
    if (!current) return
    setToast(action)
    setDecided(d => d + 1)

    // Send action to backend
    try {
      await performFileAction(current.file_id, ACTION_MAP[action] || 'REVIEWED')
    } catch (err) {
      console.error('Failed to send action:', err)
    }

    setTimeout(() => setToast(null), 1100)
    setIndex(i => i + 1)
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowRight') decide('Approved')
      if (e.key === 'ArrowLeft') decide('Rejected')
      if (e.key === 'ArrowDown') decide('Skipped')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, queue])

  const remaining = queue.length - index
  const progressPct = queue.length ? Math.round((decided / queue.length) * 100) : 0

  // Confidence comes from Phase 9 (file_explanations.confidence). If Phase 9
  // hasn't run yet for this file, current.confidence is null/undefined —
  // showing "0%" in that case would falsely claim the model has zero
  // confidence, when really we just don't have a real number yet. Fall
  // back to a score-derived estimate (same logic WhyExplain uses) and
  // label it honestly.
  let confidenceLabel = '—'
  if (current) {
    const hasRealConfidence = current.confidence != null
    const confidenceValue = hasRealConfidence
      ? Number(current.confidence)
      : Math.min(1, Math.max(0.05, (Number(current.importance_score) || 0) / 100))
    confidenceLabel = `${Math.round(confidenceValue * 100)}%${hasRealConfidence ? '' : ' (est.)'}`
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Review Queue</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {decided} of {queue.length} reviewed · use ← reject, → approve, ↓ skip
          </p>
        </div>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${progressPct}%` }} />
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-navy-900 dark:text-slate-400">
          Loading review queue…
        </div>
      ) : !current ? (
        <EmptyState
          icon={PartyPopper}
          title="You're all caught up"
          description="There's nothing left in your review queue right now. Nice work — check back after the next scan."
        />
      ) : (
        <div className="mx-auto max-w-xl">
          <div className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-card dark:border-slate-800 dark:bg-navy-900">
            {toast && (
              <div className={`absolute inset-0 z-10 flex items-center justify-center rounded-2xl text-2xl font-bold animate-fadein ${
                toast === 'Approved' ? 'bg-emerald-600/90 text-white' : toast === 'Rejected' ? 'bg-red-600/90 text-white' : 'bg-slate-600/90 text-white'
              }`}>
                {toast}
              </div>
            )}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
                  <FileIcon icon={current.icon} className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{current.name}</p>
                  <p className="font-mono text-xs text-slate-400">{current.folder}</p>
                </div>
              </div>
              <StatusBadge label={current.label} size="md" />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-3 text-center text-xs dark:bg-navy-950/60">
              <div><p className="font-semibold text-slate-700 dark:text-slate-200">{formatSize(current.size_mb)}</p><p className="text-slate-400">Size</p></div>
              <div><p className="font-semibold text-slate-700 dark:text-slate-200">{formatDate(current.modified_time)}</p><p className="text-slate-400">Modified</p></div>
              <div><p className="font-semibold text-slate-700 dark:text-slate-200">{confidenceLabel}</p><p className="text-slate-400">Confidence</p></div>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2.5 dark:bg-brand-900/20">
              <p className="text-sm font-medium text-brand-800 dark:text-brand-300">
                Recommended: <span className="font-semibold">{current.label === 'DELETE_CANDIDATE' ? 'Delete' : 'Review for archive'}</span>
              </p>
              <WhyExplain file={current} align="right" />
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              <button onClick={() => decide('Rejected')} className="focus-ring flex flex-col items-center gap-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-slate-700 dark:hover:bg-red-900/20">
                <X className="h-5 w-5" /> Reject
              </button>
              <button onClick={() => decide('Skipped')} className="focus-ring flex flex-col items-center gap-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                <SkipForward className="h-5 w-5" /> Skip
              </button>
              <button onClick={() => decide('Approved')} className="focus-ring flex flex-col items-center gap-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-emerald-600 hover:bg-emerald-50 dark:border-slate-700 dark:hover:bg-emerald-900/20">
                <Check className="h-5 w-5" /> Approve
              </button>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-slate-400">{remaining} more after this one</p>
        </div>
      )}
    </div>
  )
}
